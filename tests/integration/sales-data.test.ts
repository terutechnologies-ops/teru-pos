import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  closeCashSession,
  findOpenCashSession,
  openCashSession,
} from "@/server/data/cash-sessions";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply, recordStockMovement } from "@/server/data/inventory";
import { createDefaultPaymentMethods, listPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import { createSale, voidSale, type CreateSaleInput } from "@/server/data/sales";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("sales");

type Company = { id: string; branchId: string; warehouseId: string; cash: string; card: string };
let a: Company;
let b: Company;
let cashier: string;
let admin: string;
let cashierB: string;
let arepa: string;
let gaseosa: string;
let sinReceta: string;
let harina: string;
let queso: string;
let botella: string;

async function setupCompany(suffix: string): Promise<Company> {
  const company = await createCompany(`${tag}-${suffix}`);
  const branch = await createMainBranch(company.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, company.id));
  const methods = await listPaymentMethods(company.id);
  return {
    id: company.id,
    ...branch,
    cash: methods.find((m) => m.isCash)!.id,
    card: methods.find((m) => m.name === "Tarjeta")!.id,
  };
}

async function newProduct(companyId: string, name: string, price: string) {
  let category = await db.productCategory.findFirst({ where: { companyId } });
  if (!category) {
    await createProductCategory(companyId, "Menú");
    category = await db.productCategory.findFirstOrThrow({ where: { companyId } });
  }
  const { id } = await createProduct(companyId, {
    categoryId: category.id,
    name,
    description: null,
    price,
  });
  return id!;
}

async function newSupply(name: string, unit: "KG" | "G" | "UNIT", initial?: string) {
  const { id } = await createSupply(a.id, { name, unit, minStock: null, unitCost: null });
  if (initial) {
    await recordStockMovement(a.id, {
      warehouseId: a.warehouseId,
      supplyId: id!,
      type: "INITIAL",
      quantity: initial,
      reason: null,
      userId: admin,
    });
  }
  return id!;
}

async function balance(supplyId: string, company = a) {
  const level = await db.stockLevel.findUnique({
    where: { warehouseId_supplyId: { warehouseId: company.warehouseId, supplyId } },
  });
  return level?.quantity.toString() ?? "0";
}

async function openSession(userId: string, company = a, openingAmount = "100000") {
  const result = await openCashSession(company.id, {
    userId,
    branchId: company.branchId,
    openingAmount,
  });
  if (result.status !== "OK") throw new Error(result.status);
  return result.cashSessionId;
}

// Una arepa (16.500) pagada en efectivo justo.
function simpleSale(cashSessionId: string, userId = cashier): CreateSaleInput {
  return {
    cashSessionId,
    userId,
    lines: [{ productId: arepa, quantity: 1, note: null }],
    payments: [{ paymentMethodId: a.cash, amount: "16500", tendered: null }],
  };
}

beforeAll(async () => {
  a = await setupCompany("a");
  b = await setupCompany("b");
  cashier = (await createUser({ companyId: a.id, email: `${tag}-c@prueba.test`, role: "CASHIER" })).id;
  admin = (await createUser({ companyId: a.id, email: `${tag}-a@prueba.test`, role: "ADMIN" })).id;
  cashierB = (await createUser({ companyId: b.id, email: `${tag}-cb@prueba.test`, role: "CASHIER" })).id;

  harina = await newSupply("Harina", "KG", "10");
  queso = await newSupply("Queso", "G", "5000");
  botella = await newSupply("Gaseosa", "UNIT", "24");

  arepa = await newProduct(a.id, "Arepa de queso", "16500");
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });
  await addRecipeItem(a.id, arepa, queso, { quantity: "50", unit: "G" });
  gaseosa = await newProduct(a.id, "Gaseosa", "4000");
  await addRecipeItem(a.id, gaseosa, botella, { quantity: "1", unit: "UNIT" });
  sinReceta = await newProduct(a.id, "Jugo", "6000");
});
afterAll(() => cleanupCompanies(tag));

describe("métodos de pago", () => {
  it("cada empresa arranca con Efectivo, Tarjeta y Transferencia, con un solo efectivo", async () => {
    const methods = await listPaymentMethods(a.id);
    expect(methods.map((m) => [m.name, m.isCash])).toEqual([
      ["Efectivo", true],
      ["Tarjeta", false],
      ["Transferencia", false],
    ]);
    await expect(
      db.paymentMethod.create({
        data: { companyId: a.id, name: "Caja menor", isCash: true, position: 9 },
      }),
    ).rejects.toThrow();
    await expect(
      db.paymentMethod.create({ data: { companyId: a.id, name: "tarjeta", position: 9 } }),
    ).rejects.toThrow();
  });
});

describe("turnos de caja", () => {
  it("una persona tiene un solo turno abierto, en una sucursal de su empresa", async () => {
    const sessionId = await openSession(cashier);
    expect(
      await openCashSession(a.id, { userId: cashier, branchId: a.branchId, openingAmount: "0" }),
    ).toEqual({ status: "ALREADY_OPEN" });
    expect(
      await openCashSession(a.id, { userId: admin, branchId: b.branchId, openingAmount: "0" }),
    ).toEqual({ status: "BRANCH_NOT_FOUND" });
    expect((await findOpenCashSession(a.id, cashier))?.id).toBe(sessionId);
    expect(await findOpenCashSession(b.id, cashier)).toBeNull();
  });
});

describe("ventas", () => {
  it("cobra con pago mixto, calcula el cambio y descuenta la receta convertida", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    // 2 arepas (33.000) + 1 gaseosa (4.000) = 37.000: 20.000 en efectivo
    // (entrega 50.000) y 17.000 con tarjeta.
    const result = await createSale(a.id, {
      cashSessionId: session.id,
      userId: cashier,
      lines: [
        { productId: arepa, quantity: 2, note: "Sin sal" },
        { productId: gaseosa, quantity: 1, note: null },
      ],
      payments: [
        { paymentMethodId: a.cash, amount: "20000", tendered: "50000" },
        { paymentMethodId: a.card, amount: "17000", tendered: null },
      ],
    });
    expect(result).toMatchObject({ status: "OK", number: 1 });
    if (result.status !== "OK") return;
    expect(result.total.toString()).toBe("37000");
    expect(result.change.toString()).toBe("30000");

    const sale = await db.sale.findUniqueOrThrow({
      where: { id: result.saleId },
      include: { lines: { orderBy: { position: "asc" } }, payments: true },
    });
    expect(sale.lines.map((l) => [l.productName, l.unitPrice.toString(), l.quantity, l.lineTotal.toString(), l.note])).toEqual([
      ["Arepa de queso", "16500", 2, "33000", "Sin sal"],
      ["Gaseosa", "4000", 1, "4000", null],
    ]);
    expect(sale.payments).toHaveLength(2);

    // 2 × 120 g = 0,24 kg; 2 × 50 g; 1 und.
    expect(await balance(harina)).toBe("9.76");
    expect(await balance(queso)).toBe("4900");
    expect(await balance(botella)).toBe("23");
    const movements = await db.stockMovement.findMany({ where: { saleId: result.saleId } });
    expect(movements.map((m) => [m.type, m.quantity.toString()]).sort()).toEqual([
      ["SALE", "-0.24"],
      ["SALE", "-1"],
      ["SALE", "-100"],
    ]);
  });

  it("rechaza productos sin receta, no disponibles o ajenos", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    const sale = simpleSale(session.id);
    const withProduct = (productId: string) => ({
      ...sale,
      lines: [{ productId, quantity: 1, note: null }],
    });

    expect(await createSale(a.id, withProduct(sinReceta))).toEqual({
      status: "NO_RECIPE",
      productId: sinReceta,
    });
    const ajeno = await newProduct(b.id, "Arepa B", "16500");
    expect(await createSale(a.id, withProduct(ajeno))).toEqual({
      status: "PRODUCT_NOT_FOUND",
      productId: ajeno,
    });
    await db.product.update({ where: { id: gaseosa }, data: { isAvailable: false } });
    expect(await createSale(a.id, withProduct(gaseosa))).toEqual({
      status: "PRODUCT_UNAVAILABLE",
      productId: gaseosa,
    });
    await db.product.update({ where: { id: gaseosa }, data: { isAvailable: true } });
    expect(await createSale(a.id, { ...sale, lines: [] })).toEqual({ status: "EMPTY_SALE" });
  });

  it("valida que los pagos cubran el total exacto y el efectivo recibido", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    const sale = simpleSale(session.id);
    const withPayments = (payments: CreateSaleInput["payments"]) => ({ ...sale, payments });

    expect(
      await createSale(a.id, withPayments([{ paymentMethodId: a.cash, amount: "16000", tendered: null }])),
    ).toEqual({ status: "PAYMENTS_MISMATCH" });
    expect(
      await createSale(a.id, withPayments([{ paymentMethodId: a.card, amount: "16500", tendered: "20000" }])),
    ).toEqual({ status: "TENDERED_NOT_CASH" });
    expect(
      await createSale(a.id, withPayments([{ paymentMethodId: a.cash, amount: "16500", tendered: "10000" }])),
    ).toEqual({ status: "TENDERED_SHORT" });
    expect(
      await createSale(a.id, withPayments([{ paymentMethodId: b.cash, amount: "16500", tendered: null }])),
    ).toEqual({ status: "PAYMENT_METHOD_NOT_FOUND" });
    // Un rechazo no consume número.
    expect(await db.company.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      lastSaleNumber: 1,
    });
  });

  it("solo se vende en el turno propio y abierto", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    expect(await createSale(a.id, simpleSale(session.id, admin))).toEqual({
      status: "CASH_SESSION_NOT_FOUND",
    });
    expect(await createSale(b.id, { ...simpleSale(session.id), userId: cashierB })).toEqual({
      status: "CASH_SESSION_NOT_FOUND",
    });
  });

  it("dos ventas simultáneas reciben números consecutivos sin repetir", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    const results = await Promise.all([
      createSale(a.id, simpleSale(session.id)),
      createSale(a.id, simpleSale(session.id)),
    ]);
    const numbers = results.map((r) => (r.status === "OK" ? r.number : r.status)).sort();
    expect(numbers).toEqual([2, 3]);
    // 0,24 + 2 × 0,12 kg de harina.
    expect(await balance(harina)).toBe("9.52");
  });

  it("la venta deja el saldo negativo; los ajustes manuales no lo empeoran", async () => {
    const sal = await newSupply("Sal", "KG", "0.001");
    const arepaSal = await newProduct(a.id, "Arepa con sal", "5000");
    // Medio gramo de un insumo en kg: 0,0005 kg sin redondear.
    await addRecipeItem(a.id, arepaSal, sal, { quantity: "0.5", unit: "G" });
    const session = (await findOpenCashSession(a.id, cashier))!;
    const sell = (quantity: number) =>
      createSale(a.id, {
        cashSessionId: session.id,
        userId: cashier,
        lines: [{ productId: arepaSal, quantity, note: null }],
        payments: [{ paymentMethodId: a.card, amount: String(5000 * quantity), tendered: null }],
      });

    expect((await sell(1)).status).toBe("OK");
    expect(await balance(sal)).toBe("0.0005");
    expect((await sell(3)).status).toBe("OK");
    expect(await balance(sal)).toBe("-0.001");

    const move = (quantity: string) =>
      recordStockMovement(a.id, {
        warehouseId: a.warehouseId,
        supplyId: sal,
        type: "ADJUSTMENT",
        quantity,
        reason: "Conteo",
        userId: admin,
      });
    expect((await move("-0.001")).status).toBe("INSUFFICIENT_STOCK");
    // Una entrada se acepta aunque no cubra el faltante.
    expect((await move("0.0005")).status).toBe("OK");
    expect(await balance(sal)).toBe("-0.0005");
  });

  it("la BD exige que los movimientos de venta apunten a una venta", async () => {
    await expect(
      db.stockMovement.create({
        data: {
          companyId: a.id,
          warehouseId: a.warehouseId,
          supplyId: harina,
          type: "SALE",
          quantity: "-1",
          balanceAfter: "0",
          userId: admin,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("anulación y cierre", () => {
  it("anular devuelve el inventario una sola vez y la venta deja de contar en la caja", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    const sale = await createSale(a.id, simpleSale(session.id));
    if (sale.status !== "OK") throw new Error(sale.status);
    const before = await balance(harina);

    expect(await voidSale(b.id, { saleId: sale.saleId, userId: admin, reason: "Error" })).toEqual({
      status: "NOT_FOUND",
    });
    expect(
      await voidSale(a.id, { saleId: sale.saleId, userId: admin, reason: "Pedido equivocado" }),
    ).toEqual({ status: "OK" });
    expect(
      await voidSale(a.id, { saleId: sale.saleId, userId: admin, reason: "Otra vez" }),
    ).toEqual({ status: "ALREADY_VOIDED" });

    expect(Number(await balance(harina)) - Number(before)).toBeCloseTo(0.12);
    const voided = await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } });
    expect(voided).toMatchObject({ status: "VOIDED", voidedById: admin, voidReason: "Pedido equivocado" });
    const returns = await db.stockMovement.findMany({
      where: { saleId: sale.saleId, type: "SALE_VOID" },
    });
    expect(returns.map((m) => m.quantity.toString()).sort()).toEqual(["0.12", "50"]);
  });

  it("el cierre calcula el esperado con el efectivo de las ventas no anuladas", async () => {
    const session = (await findOpenCashSession(a.id, cashier))!;
    // Efectivo: 20.000 (venta 1) + 2 × 16.500 (ventas 2 y 3); la anulada no
    // cuenta y lo demás fue con tarjeta. Fondo: 100.000.
    expect(
      await closeCashSession(a.id, {
        cashSessionId: session.id,
        userId: admin,
        onlyOwner: true,
        countedCash: "0",
        closingNote: null,
      }),
    ).toEqual({ status: "NOT_FOUND" });
    const closed = await closeCashSession(a.id, {
      cashSessionId: session.id,
      userId: cashier,
      onlyOwner: true,
      countedCash: "152000",
      closingNote: "Faltan 1.000",
    });
    expect(closed.status).toBe("OK");
    if (closed.status !== "OK") return;
    expect(closed.expectedCash.toString()).toBe("153000");
    expect(closed.difference.toString()).toBe("-1000");

    expect(
      await closeCashSession(a.id, {
        cashSessionId: session.id,
        userId: cashier,
        onlyOwner: true,
        countedCash: "0",
        closingNote: null,
      }),
    ).toEqual({ status: "ALREADY_CLOSED" });
  });

  it("con el turno cerrado no se vende ni se anula, y se puede abrir otro", async () => {
    const closed = await db.cashSession.findFirstOrThrow({
      where: { companyId: a.id, userId: cashier, closedAt: { not: null } },
    });
    expect(await createSale(a.id, simpleSale(closed.id))).toEqual({
      status: "CASH_SESSION_CLOSED",
    });
    const sale = await db.sale.findFirstOrThrow({
      where: { cashSessionId: closed.id, status: "COMPLETED" },
    });
    expect(await voidSale(a.id, { saleId: sale.id, userId: admin, reason: "Tarde" })).toEqual({
      status: "CASH_SESSION_CLOSED",
    });
    const next = await openSession(cashier, a, "50000");
    expect(next).not.toBe(closed.id);
  });
});
