import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { convertQuantity, sameUnitFamily } from "@/lib/units";
import {
  lockSupply,
  lockWarehouse,
  stockBalance,
  writeStockMovement,
} from "@/server/data/inventory";

// Compras de insumos (ver ADR 0008). Se arman en borrador; al confirmarse
// entran al inventario de su bodega y actualizan el costo promedio de cada
// insumo; confirmadas no cambian: se anulan. Cantidades y montos entran
// como texto decimal ya validado.

// Mismo margen que las ventas (latencia a Supabase).
const PURCHASE_TX_OPTIONS = { timeout: 30_000 };

// Decimales de supplies.unitCost.
const UNIT_COST_DECIMALS = 4;

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

// Bloquea la compra hasta el fin de la transacción: las escrituras de un
// mismo borrador (líneas, confirmar, borrar) no se cruzan.
async function lockPurchase(tx: Prisma.TransactionClient, companyId: string, purchaseId: string) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status" FROM "purchases"
    WHERE "id" = ${purchaseId} AND "companyId" = ${companyId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

// El total del borrador sigue a sus líneas.
async function refreshTotal(tx: Prisma.TransactionClient, companyId: string, purchaseId: string) {
  const { _sum } = await tx.purchaseLine.aggregate({
    where: { companyId, purchaseId },
    _sum: { lineTotal: true },
  });
  await tx.purchase.update({
    where: { id: purchaseId },
    data: { total: _sum.lineTotal ?? new Prisma.Decimal(0) },
  });
}

// --- Borrador ---------------------------------------------------------------

export type PurchaseHeader = {
  supplierId: string;
  warehouseId: string;
  supplierInvoice: string | null;
  // Día de la compra (medianoche UTC de ese día del calendario).
  purchasedOn: Date;
};

type HeaderStatus = "SUPPLIER_NOT_FOUND" | "WAREHOUSE_NOT_FOUND";

// Proveedor vigente y bodega activa de la empresa.
async function checkHeader(
  tx: Prisma.TransactionClient,
  companyId: string,
  header: PurchaseHeader,
): Promise<HeaderStatus | null> {
  const [supplier, warehouse] = await Promise.all([
    tx.thirdParty.findFirst({
      where: { id: header.supplierId, companyId, isSupplier: true, isArchived: false },
      select: { id: true },
    }),
    tx.warehouse.findFirst({
      where: { id: header.warehouseId, companyId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!supplier) return "SUPPLIER_NOT_FOUND";
  if (!warehouse) return "WAREHOUSE_NOT_FOUND";
  return null;
}

export type CreatePurchaseResult = { status: "OK"; purchaseId: string } | { status: HeaderStatus };

export async function createPurchaseDraft(
  companyId: string,
  input: PurchaseHeader & { userId: string },
): Promise<CreatePurchaseResult> {
  return db.$transaction(async (tx) => {
    const invalid = await checkHeader(tx, companyId, input);
    if (invalid) return { status: invalid };
    const purchase = await tx.purchase.create({
      data: {
        companyId,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        supplierInvoice: input.supplierInvoice,
        purchasedOn: input.purchasedOn,
        createdById: input.userId,
      },
      select: { id: true },
    });
    return { status: "OK", purchaseId: purchase.id };
  });
}

export type DraftWriteStatus = "OK" | "NOT_FOUND" | "NOT_DRAFT";

export async function updatePurchaseDraft(
  companyId: string,
  purchaseId: string,
  header: PurchaseHeader,
): Promise<{ status: DraftWriteStatus | HeaderStatus }> {
  return db.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, companyId, purchaseId);
    if (!purchase) return { status: "NOT_FOUND" };
    if (purchase.status !== "DRAFT") return { status: "NOT_DRAFT" };
    const invalid = await checkHeader(tx, companyId, header);
    if (invalid) return { status: invalid };
    await tx.purchase.update({ where: { id: purchaseId }, data: header });
    return { status: "OK" };
  });
}

// Un borrador no es un documento: se borra con sus líneas.
export async function deletePurchaseDraft(
  companyId: string,
  purchaseId: string,
): Promise<{ status: DraftWriteStatus }> {
  return db.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, companyId, purchaseId);
    if (!purchase) return { status: "NOT_FOUND" };
    if (purchase.status !== "DRAFT") return { status: "NOT_DRAFT" };
    await tx.purchaseLine.deleteMany({ where: { companyId, purchaseId } });
    await tx.purchase.delete({ where: { id: purchaseId } });
    return { status: "OK" };
  });
}

// --- Líneas del borrador ----------------------------------------------------

export type PurchaseLineInput = {
  // Cantidad > 0 en `unit`, de la familia de la unidad del insumo.
  quantity: string;
  unit: StockUnit;
  // Lo que se pagó por la línea, con impuestos (>= 0).
  lineTotal: string;
};

export type LineWriteStatus =
  | DraftWriteStatus
  | "SUPPLY_NOT_FOUND"
  | "SUPPLY_ARCHIVED"
  | "UNIT_MISMATCH"
  | "ALREADY_IN_PURCHASE";

export async function addPurchaseLine(
  companyId: string,
  purchaseId: string,
  input: PurchaseLineInput & { supplyId: string },
): Promise<{ status: LineWriteStatus }> {
  try {
    return await db.$transaction(async (tx) => {
      const purchase = await lockPurchase(tx, companyId, purchaseId);
      if (!purchase) return { status: "NOT_FOUND" };
      if (purchase.status !== "DRAFT") return { status: "NOT_DRAFT" };
      // Bloqueado: su unidad no cambia mientras se valida la familia.
      const supply = await lockSupply(tx, companyId, input.supplyId);
      if (!supply) return { status: "SUPPLY_NOT_FOUND" };
      if (supply.isArchived) return { status: "SUPPLY_ARCHIVED" };
      if (!sameUnitFamily(supply.unit, input.unit)) return { status: "UNIT_MISMATCH" };

      const { _max } = await tx.purchaseLine.aggregate({
        where: { companyId, purchaseId },
        _max: { position: true },
      });
      await tx.purchaseLine.create({
        data: {
          companyId,
          purchaseId,
          supplyId: input.supplyId,
          position: (_max.position ?? 0) + 1,
          quantity: new Prisma.Decimal(input.quantity),
          unit: input.unit,
          lineTotal: new Prisma.Decimal(input.lineTotal),
        },
      });
      await refreshTotal(tx, companyId, purchaseId);
      return { status: "OK" };
    });
  } catch (error) {
    // Único (compra, insumo): el insumo ya está en la compra.
    if (prismaCode(error) === "P2002") return { status: "ALREADY_IN_PURCHASE" };
    throw error;
  }
}

// La línea, solo si es de la empresa (con el estado de su compra).
async function findLineForWrite(tx: Prisma.TransactionClient, companyId: string, lineId: string) {
  return tx.purchaseLine.findFirst({
    where: { id: lineId, companyId },
    select: { purchaseId: true, supplyId: true },
  });
}

export async function updatePurchaseLine(
  companyId: string,
  lineId: string,
  input: PurchaseLineInput,
): Promise<{ status: LineWriteStatus }> {
  return db.$transaction(async (tx) => {
    const line = await findLineForWrite(tx, companyId, lineId);
    if (!line) return { status: "NOT_FOUND" };
    const purchase = await lockPurchase(tx, companyId, line.purchaseId);
    if (!purchase) return { status: "NOT_FOUND" };
    if (purchase.status !== "DRAFT") return { status: "NOT_DRAFT" };
    const supply = await lockSupply(tx, companyId, line.supplyId);
    if (!supply) return { status: "SUPPLY_NOT_FOUND" };
    if (!sameUnitFamily(supply.unit, input.unit)) return { status: "UNIT_MISMATCH" };

    await tx.purchaseLine.update({
      where: { id: lineId },
      data: {
        quantity: new Prisma.Decimal(input.quantity),
        unit: input.unit,
        lineTotal: new Prisma.Decimal(input.lineTotal),
      },
    });
    await refreshTotal(tx, companyId, line.purchaseId);
    return { status: "OK" };
  });
}

export async function removePurchaseLine(
  companyId: string,
  lineId: string,
): Promise<{ status: DraftWriteStatus }> {
  return db.$transaction(async (tx) => {
    const line = await findLineForWrite(tx, companyId, lineId);
    if (!line) return { status: "NOT_FOUND" };
    const purchase = await lockPurchase(tx, companyId, line.purchaseId);
    if (!purchase) return { status: "NOT_FOUND" };
    if (purchase.status !== "DRAFT") return { status: "NOT_DRAFT" };
    await tx.purchaseLine.delete({ where: { id: lineId } });
    await refreshTotal(tx, companyId, line.purchaseId);
    return { status: "OK" };
  });
}

// --- Confirmar ---------------------------------------------------------------

// Costo promedio ponderado del insumo tras la entrada. Si no tenía costo o
// su existencia total no era positiva, el costo es el de la compra (no hay
// existencias valorizadas con qué promediar). Todo en la unidad del insumo.
export function weightedUnitCost(input: {
  stockBefore: Prisma.Decimal;
  costBefore: Prisma.Decimal | null;
  quantity: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}) {
  const { stockBefore, costBefore, quantity, lineTotal } = input;
  const cost =
    costBefore === null || !stockBefore.isPositive()
      ? lineTotal.dividedBy(quantity)
      : stockBefore.times(costBefore).plus(lineTotal).dividedBy(stockBefore.plus(quantity));
  return cost.toDecimalPlaces(UNIT_COST_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);
}

export type ConfirmPurchaseResult =
  | { status: "OK"; number: number }
  | { status: "NOT_FOUND" | "NOT_DRAFT" | "EMPTY" | "WAREHOUSE_INACTIVE" }
  | { status: "SUPPLY_ARCHIVED" | "UNIT_MISMATCH"; supplyId: string };

// Entra cada línea a la bodega de la compra (movimiento PURCHASE), actualiza
// el costo promedio de cada insumo y asigna el consecutivo, todo en una
// transacción.
export async function confirmPurchase(
  companyId: string,
  input: { purchaseId: string; userId: string },
): Promise<ConfirmPurchaseResult> {
  return db.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, companyId, input.purchaseId);
    if (!purchase) return { status: "NOT_FOUND" };
    if (purchase.status !== "DRAFT") return { status: "NOT_DRAFT" };

    const { warehouseId } = await tx.purchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
      select: { warehouseId: true },
    });
    // Orden fijo de bloqueo de insumos, como en las ventas.
    const lines = await tx.purchaseLine.findMany({
      where: { companyId, purchaseId: input.purchaseId },
      orderBy: { supplyId: "asc" },
      select: { supplyId: true, quantity: true, unit: true, lineTotal: true },
    });
    if (lines.length === 0) return { status: "EMPTY" };

    const warehouse = await lockWarehouse(tx, companyId, warehouseId, "SHARE");
    if (!warehouse?.isActive) return { status: "WAREHOUSE_INACTIVE" };

    // Primero se bloquean y validan todos: devolver un error no deshace la
    // transacción, así que no se escribe nada hasta saber que todo pasa.
    const entries: { line: (typeof lines)[number]; quantity: Prisma.Decimal }[] = [];
    for (const line of lines) {
      const supply = await lockSupply(tx, companyId, line.supplyId);
      if (!supply) throw new Error(`Insumo de compra inexistente: ${line.supplyId}`);
      const { supplyId } = line;
      if (supply.isArchived) return { status: "SUPPLY_ARCHIVED", supplyId };
      if (!sameUnitFamily(supply.unit, line.unit)) return { status: "UNIT_MISMATCH", supplyId };
      const quantity = new Prisma.Decimal(
        convertQuantity(line.quantity.toString(), line.unit, supply.unit),
      );
      entries.push({ line, quantity });
    }

    for (const { line, quantity } of entries) {
      const { supplyId } = line;
      // Existencia total del insumo (todas las bodegas) antes de la entrada:
      // el costo es uno por insumo.
      const [{ _sum }, current] = await Promise.all([
        tx.stockLevel.aggregate({ where: { companyId, supplyId }, _sum: { quantity: true } }),
        tx.supply.findUniqueOrThrow({ where: { id: supplyId }, select: { unitCost: true } }),
      ]);
      await tx.supply.update({
        where: { id: supplyId },
        data: {
          unitCost: weightedUnitCost({
            stockBefore: _sum.quantity ?? new Prisma.Decimal(0),
            costBefore: current.unitCost,
            quantity,
            lineTotal: line.lineTotal,
          }),
        },
      });

      const key = { warehouseId, supplyId };
      const balance = await stockBalance(tx, key);
      await writeStockMovement(tx, companyId, {
        ...key,
        type: "PURCHASE",
        quantity,
        balanceAfter: balance.plus(quantity),
        reason: null,
        userId: input.userId,
        purchaseId: input.purchaseId,
      });
    }

    // El consecutivo al final, como en las ventas: si algo falla, vuelve.
    const [{ lastPurchaseNumber: number }] = await tx.$queryRaw<{ lastPurchaseNumber: number }[]>`
      UPDATE "companies" SET "lastPurchaseNumber" = "lastPurchaseNumber" + 1
      WHERE "id" = ${companyId}
      RETURNING "lastPurchaseNumber"`;
    await tx.purchase.update({
      where: { id: input.purchaseId },
      data: {
        status: "CONFIRMED",
        number,
        confirmedAt: new Date(),
        confirmedById: input.userId,
        total: lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)),
      },
    });
    return { status: "OK", number };
  }, PURCHASE_TX_OPTIONS);
}

// --- Anular -------------------------------------------------------------------

export type VoidPurchaseResult = {
  status: "OK" | "NOT_FOUND" | "NOT_CONFIRMED" | "ALREADY_VOIDED";
};

// Saca de cada bodega lo que la compra había entrado (PURCHASE_VOID). Puede
// dejar saldos negativos si ya se consumió (se permite y se avisa, como en
// las ventas). El costo promedio no se recalcula (ver ADR 0008).
export async function voidPurchase(
  companyId: string,
  input: { purchaseId: string; userId: string; reason: string },
): Promise<VoidPurchaseResult> {
  return db.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, companyId, input.purchaseId);
    if (!purchase) return { status: "NOT_FOUND" };
    if (purchase.status === "VOIDED") return { status: "ALREADY_VOIDED" };
    if (purchase.status !== "CONFIRMED") return { status: "NOT_CONFIRMED" };

    const movements = await tx.stockMovement.findMany({
      where: { companyId, purchaseId: input.purchaseId, type: "PURCHASE" },
      orderBy: { supplyId: "asc" },
      select: { warehouseId: true, supplyId: true, quantity: true },
    });
    for (const movement of movements) {
      await lockSupply(tx, companyId, movement.supplyId);
      const key = { warehouseId: movement.warehouseId, supplyId: movement.supplyId };
      const removed = movement.quantity.negated();
      const balance = await stockBalance(tx, key);
      await writeStockMovement(tx, companyId, {
        ...key,
        type: "PURCHASE_VOID",
        quantity: removed,
        balanceAfter: balance.plus(removed),
        reason: input.reason,
        userId: input.userId,
        purchaseId: input.purchaseId,
      });
    }

    await tx.purchase.update({
      where: { id: input.purchaseId },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
      },
    });
    return { status: "OK" };
  }, PURCHASE_TX_OPTIONS);
}
