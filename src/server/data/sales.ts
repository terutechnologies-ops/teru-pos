import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { convertQuantity } from "@/lib/units";
import { CASH_TX_OPTIONS, lockCashSession } from "@/server/data/cash-sessions";
import { lockSupply, stockBalance, writeStockMovement } from "@/server/data/inventory";

// Ventas de mostrador: se crean cobradas y no se editan ni se borran; se
// anulan mientras su turno siga abierto (ver ADR 0007). Montos como texto
// decimal ya validado; cantidades de producto enteras.

// La moneda no cambia con ventas registradas (services/companies.ts).
export async function companyHasSales(companyId: string) {
  return (await db.sale.count({ where: { companyId }, take: 1 })) > 0;
}

export type SaleLineInput = { productId: string; quantity: number; note: string | null };
export type SalePaymentInput = {
  paymentMethodId: string;
  amount: string;
  // Solo efectivo: lo que entregó el cliente (null = justo).
  tendered: string | null;
};

export type CreateSaleInput = {
  cashSessionId: string;
  userId: string;
  lines: SaleLineInput[];
  payments: SalePaymentInput[];
  // Clave del pedido (POS). Sin clave no hay protección contra duplicados.
  clientKey?: string | null;
};

type SaleSummary = {
  saleId: string;
  number: number;
  total: Prisma.Decimal;
  change: Prisma.Decimal;
};

export type CreateSaleResult =
  | ({ status: "OK" } & SaleSummary)
  // El mismo pedido (clientKey) ya se había registrado: no se crea otra.
  | ({ status: "ALREADY_RECORDED" } & SaleSummary)
  | {
      status:
        | "EMPTY_SALE"
        | "CASH_SESSION_NOT_FOUND"
        | "CASH_SESSION_CLOSED"
        | "NO_MAIN_WAREHOUSE"
        | "PAYMENT_METHOD_NOT_FOUND"
        | "TENDERED_NOT_CASH"
        | "TENDERED_SHORT"
        | "PAYMENTS_MISMATCH";
    }
  | { status: "PRODUCT_NOT_FOUND" | "PRODUCT_UNAVAILABLE" | "NO_RECIPE"; productId: string };

type Consumption = { quantity: Prisma.Decimal; unit: StockUnit };

// Venta ya registrada con esa clave, por la misma persona.
async function findRecordedSale(
  companyId: string,
  clientKey: string,
  userId: string,
): Promise<SaleSummary | null> {
  const sale = await db.sale.findUnique({
    where: { companyId_clientKey: { companyId, clientKey } },
    select: {
      id: true,
      number: true,
      total: true,
      userId: true,
      payments: { select: { amount: true, tendered: true } },
    },
  });
  if (!sale || sale.userId !== userId) return null;
  const change = sale.payments.reduce(
    (sum, payment) => (payment.tendered ? sum.plus(payment.tendered.minus(payment.amount)) : sum),
    new Prisma.Decimal(0),
  );
  return { saleId: sale.id, number: sale.number, total: sale.total, change };
}

export async function createSale(
  companyId: string,
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
  if (input.lines.length === 0) return { status: "EMPTY_SALE" };

  const { clientKey } = input;
  if (clientKey) {
    const recorded = await findRecordedSale(companyId, clientKey, input.userId);
    if (recorded) return { status: "ALREADY_RECORDED", ...recorded };
  }
  try {
    return await recordSale(companyId, input);
  } catch (error) {
    // Dos envíos simultáneos del mismo pedido: el índice único deja pasar
    // uno; el otro devuelve la venta que quedó.
    const duplicate =
      clientKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (duplicate) {
      const recorded = await findRecordedSale(companyId, clientKey, input.userId);
      if (recorded) return { status: "ALREADY_RECORDED", ...recorded };
    }
    throw error;
  }
}

async function recordSale(companyId: string, input: CreateSaleInput): Promise<CreateSaleResult> {
  return db.$transaction(async (tx) => {
    // El cierre del turno espera a que termine esta venta (FOR SHARE).
    const session = await lockCashSession(tx, companyId, input.cashSessionId, "SHARE");
    if (!session || session.userId !== input.userId) return { status: "CASH_SESSION_NOT_FOUND" };
    if (session.closedAt) return { status: "CASH_SESSION_CLOSED" };

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await tx.product.findMany({
      where: { companyId, id: { in: productIds } },
      select: {
        id: true,
        name: true,
        price: true,
        isArchived: true,
        isAvailable: true,
        recipeItems: { select: { supplyId: true, quantity: true, unit: true } },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    for (const productId of productIds) {
      const product = productById.get(productId);
      if (!product) return { status: "PRODUCT_NOT_FOUND", productId };
      if (product.isArchived || !product.isAvailable) {
        return { status: "PRODUCT_UNAVAILABLE", productId };
      }
      // Sin receta la venta no descontaría inventario (ver ADR 0007).
      if (product.recipeItems.length === 0) return { status: "NO_RECIPE", productId };
    }

    const lines = input.lines.map((line, index) => {
      const product = productById.get(line.productId)!;
      return {
        productId: product.id,
        position: index + 1,
        productName: product.name,
        unitPrice: product.price,
        quantity: line.quantity,
        lineTotal: product.price.times(line.quantity),
        note: line.note,
      };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));

    const methodIds = [...new Set(input.payments.map((payment) => payment.paymentMethodId))];
    const methods = await tx.paymentMethod.findMany({
      where: { companyId, id: { in: methodIds }, isActive: true },
      select: { id: true, isCash: true },
    });
    if (methods.length !== methodIds.length) return { status: "PAYMENT_METHOD_NOT_FOUND" };
    const isCash = new Map(methods.map((method) => [method.id, method.isCash]));
    let paid = new Prisma.Decimal(0);
    let change = new Prisma.Decimal(0);
    for (const payment of input.payments) {
      const amount = new Prisma.Decimal(payment.amount);
      paid = paid.plus(amount);
      if (payment.tendered !== null) {
        if (!isCash.get(payment.paymentMethodId)) return { status: "TENDERED_NOT_CASH" };
        const tendered = new Prisma.Decimal(payment.tendered);
        if (tendered.lessThan(amount)) return { status: "TENDERED_SHORT" };
        change = change.plus(tendered.minus(amount));
      }
    }
    if (!paid.equals(total)) return { status: "PAYMENTS_MISMATCH" };

    // La principal no se puede desactivar (data/inventory.ts).
    const warehouse = await tx.warehouse.findFirst({
      where: { companyId, branchId: session.branchId, isMain: true },
      select: { id: true },
    });
    if (!warehouse) return { status: "NO_MAIN_WAREHOUSE" };

    // Consumo por insumo, sumando todas las líneas que lo usan. Se convierte
    // a la unidad del insumo después de bloquearlo (la unidad es la vigente).
    const consumption = new Map<string, Consumption[]>();
    for (const line of input.lines) {
      for (const item of productById.get(line.productId)!.recipeItems) {
        const parts = consumption.get(item.supplyId) ?? [];
        parts.push({ quantity: item.quantity.times(line.quantity), unit: item.unit });
        consumption.set(item.supplyId, parts);
      }
    }
    // Orden fijo de bloqueo: dos ventas con los mismos insumos no se cruzan.
    const supplyIds = [...consumption.keys()].sort();
    const deductions: { supplyId: string; quantity: Prisma.Decimal }[] = [];
    for (const supplyId of supplyIds) {
      const supply = await lockSupply(tx, companyId, supplyId);
      if (!supply) throw new Error(`Insumo de receta inexistente: ${supplyId}`);
      const quantity = consumption
        .get(supplyId)!
        .reduce(
          (sum, part) =>
            sum.plus(convertQuantity(part.quantity.toString(), part.unit, supply.unit)),
          new Prisma.Decimal(0),
        );
      deductions.push({ supplyId, quantity });
    }

    // El consecutivo se toma al final: la fila de la empresa queda bloqueada
    // el menor tiempo posible, y si algo falla el número vuelve con el rollback.
    const [{ lastSaleNumber: number }] = await tx.$queryRaw<{ lastSaleNumber: number }[]>`
      UPDATE "companies" SET "lastSaleNumber" = "lastSaleNumber" + 1
      WHERE "id" = ${companyId}
      RETURNING "lastSaleNumber"`;

    const sale = await tx.sale.create({
      data: {
        companyId,
        number,
        branchId: session.branchId,
        cashSessionId: input.cashSessionId,
        userId: input.userId,
        total,
        clientKey: input.clientKey ?? null,
        lines: { createMany: { data: lines } },
        payments: {
          createMany: {
            data: input.payments.map((payment) => ({
              paymentMethodId: payment.paymentMethodId,
              amount: new Prisma.Decimal(payment.amount),
              tendered: payment.tendered === null ? null : new Prisma.Decimal(payment.tendered),
            })),
          },
        },
      },
      select: { id: true },
    });

    for (const { supplyId, quantity } of deductions) {
      const key = { warehouseId: warehouse.id, supplyId };
      const balance = await stockBalance(tx, key);
      // Puede quedar negativo: la venta no se frena por inventario.
      await writeStockMovement(tx, companyId, {
        ...key,
        type: "SALE",
        quantity: quantity.negated(),
        balanceAfter: balance.minus(quantity),
        reason: null,
        userId: input.userId,
        saleId: sale.id,
      });
    }

    return { status: "OK", saleId: sale.id, number, total, change };
  }, CASH_TX_OPTIONS);
}

export type VoidSaleResult =
  | { status: "OK" }
  | { status: "NOT_FOUND" | "ALREADY_VOIDED" | "CASH_SESSION_CLOSED" };

// Anula la venta y devuelve a su bodega lo que descontó, con movimientos
// SALE_VOID. Solo con el turno abierto: un cierre ya hecho no cambia.
export async function voidSale(
  companyId: string,
  input: { saleId: string; userId: string; reason: string },
): Promise<VoidSaleResult> {
  return db.$transaction(async (tx) => {
    const [sale] = await tx.$queryRaw<{ status: string; cashSessionId: string }[]>`
      SELECT "status"::text AS "status", "cashSessionId" FROM "sales"
      WHERE "id" = ${input.saleId} AND "companyId" = ${companyId}
      FOR UPDATE`;
    if (!sale) return { status: "NOT_FOUND" };
    if (sale.status === "VOIDED") return { status: "ALREADY_VOIDED" };
    const session = await lockCashSession(tx, companyId, sale.cashSessionId, "SHARE");
    if (!session || session.closedAt) return { status: "CASH_SESSION_CLOSED" };

    const movements = await tx.stockMovement.findMany({
      where: { companyId, saleId: input.saleId, type: "SALE" },
      orderBy: { supplyId: "asc" },
      select: { warehouseId: true, supplyId: true, quantity: true },
    });
    for (const movement of movements) {
      await lockSupply(tx, companyId, movement.supplyId);
      const key = { warehouseId: movement.warehouseId, supplyId: movement.supplyId };
      const returned = movement.quantity.negated();
      const balance = await stockBalance(tx, key);
      await writeStockMovement(tx, companyId, {
        ...key,
        type: "SALE_VOID",
        quantity: returned,
        balanceAfter: balance.plus(returned),
        reason: input.reason,
        userId: input.userId,
        saleId: input.saleId,
      });
    }

    await tx.sale.update({
      where: { id: input.saleId },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
      },
    });
    return { status: "OK" };
  }, CASH_TX_OPTIONS);
}

// --- Consultas del panel ----------------------------------------------------

export type SaleFilters = {
  // Rango [from, to) ya convertido desde los días de la zona de la empresa.
  from: Date;
  to: Date;
  userId?: string;
  branchId?: string;
  status?: "COMPLETED" | "VOIDED";
};

function saleWhere(companyId: string, filters: SaleFilters): Prisma.SaleWhereInput {
  return {
    companyId,
    createdAt: { gte: filters.from, lt: filters.to },
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.branchId && { branchId: filters.branchId }),
    ...(filters.status && { status: filters.status }),
  };
}

// Las más recientes primero, con lo necesario para la fila de la lista.
export async function listSales(companyId: string, filters: SaleFilters, take: number) {
  const where = saleWhere(companyId, filters);
  const [sales, total] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        number: true,
        createdAt: true,
        total: true,
        status: true,
        user: { select: { name: true } },
        branch: { select: { name: true } },
        lines: {
          orderBy: { position: "asc" },
          select: { productName: true, quantity: true },
        },
        payments: { select: { paymentMethod: { select: { name: true } } } },
      },
    }),
    db.sale.count({ where }),
  ]);
  return { sales, total };
}

// Resumen del rango (sin el filtro de estado): vendido por método de pago y
// anuladas aparte.
export async function summarizeSales(companyId: string, filters: SaleFilters) {
  const base = saleWhere(companyId, { ...filters, status: undefined });
  const [completed, voided, byMethod] = await Promise.all([
    db.sale.aggregate({
      where: { ...base, status: "COMPLETED" },
      _count: true,
      _sum: { total: true },
    }),
    db.sale.aggregate({
      where: { ...base, status: "VOIDED" },
      _count: true,
      _sum: { total: true },
    }),
    db.salePayment.groupBy({
      by: ["paymentMethodId"],
      where: { companyId, sale: { ...base, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
  ]);
  return {
    completedCount: completed._count,
    completedTotal: completed._sum.total ?? new Prisma.Decimal(0),
    voidedCount: voided._count,
    voidedTotal: voided._sum.total ?? new Prisma.Decimal(0),
    byMethod: byMethod.map((row) => ({
      paymentMethodId: row.paymentMethodId,
      amount: row._sum.amount ?? new Prisma.Decimal(0),
    })),
  };
}

// Quienes han vendido (incluye personas ya desactivadas): filtro de cajero.
export async function listSaleCashiers(companyId: string) {
  return db.user.findMany({
    where: { companyId, sales: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function findSaleIdByNumber(companyId: string, number: number) {
  const sale = await db.sale.findUnique({
    where: { companyId_number: { companyId, number } },
    select: { id: true },
  });
  return sale?.id ?? null;
}

export async function findSaleDetail(companyId: string, saleId: string) {
  return db.sale.findFirst({
    where: { id: saleId, companyId },
    select: {
      id: true,
      number: true,
      createdAt: true,
      total: true,
      status: true,
      voidedAt: true,
      voidReason: true,
      voidedBy: { select: { name: true } },
      user: { select: { name: true } },
      branch: { select: { name: true } },
      cashSession: { select: { id: true, openedAt: true, closedAt: true } },
      lines: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
          note: true,
        },
      },
      payments: {
        orderBy: { paymentMethod: { position: "asc" } },
        select: {
          id: true,
          amount: true,
          tendered: true,
          paymentMethod: { select: { name: true, isCash: true } },
        },
      },
      stockMovements: {
        orderBy: [{ type: "asc" }, { supply: { name: "asc" } }],
        select: {
          id: true,
          type: true,
          quantity: true,
          warehouse: { select: { name: true } },
          supply: { select: { id: true, name: true, unit: true } },
        },
      },
    },
  });
}
