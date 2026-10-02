import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply, recordStockMovement } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { closeShift, openShift } from "@/server/services/cash-sessions";
import {
  checkout,
  findSaleByNumber,
  getSaleDetail,
  getSalesOverview,
  voidSaleFromPanel,
} from "@/server/services/sales";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("salespanel");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let cashier: StaffSessionDto;
let admin: StaffSessionDto;
let warehouseId: string;
let harina: string;
const saleIds: Record<number, string> = {};

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  warehouseId = (await createMainBranch(a.id)).warehouseId;
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  const methods = await db.paymentMethod.findMany({ where: { companyId: a.id } });
  const cash = methods.find((m) => m.isCash)!.id;
  const card = methods.find((m) => m.name === "Tarjeta")!.id;

  const cashierUser = await createUser({
    companyId: a.id,
    email: `cajero@${tag}.co`,
    role: "CASHIER",
    name: "Ana Cajera",
  });
  const adminUser = await createUser({ companyId: a.id, email: `admin@${tag}.co`, role: "ADMIN" });
  cashier = sessionFor(a, cashierUser.id, "CASHIER");
  admin = sessionFor(a, adminUser.id, "ADMIN");

  await createProductCategory(a.id, "Arepas");
  const arepas = (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id } })).id;
  harina = (await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, unitCost: null }))
    .id!;
  await recordStockMovement(a.id, {
    warehouseId,
    supplyId: harina,
    type: "INITIAL",
    quantity: "10",
    reason: null,
    userId: adminUser.id,
  });
  const arepa = (
    await createProduct(a.id, { categoryId: arepas, name: "Arepa", description: null, price: "16500" })
  ).id!;
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });

  await openShift(cashier, { branchId: "", openingAmount: "0" });
  const sell = async (quantity: number, payments: unknown[], note?: string) => {
    const result = await checkout(cashier, {
      clientKey: randomUUID(),
      lines: [{ productId: arepa, quantity, note }],
      payments,
    });
    if (!result.ok) throw new Error(result.error);
    saleIds[result.number] = (await db.sale.findFirstOrThrow({
      where: { companyId: a.id, number: result.number },
    })).id;
  };
  // #1 efectivo con cambio, #2 tarjeta, #3 efectivo (se mueve a otro día).
  await sell(1, [{ paymentMethodId: cash, amount: "16500", tendered: "20000" }], "sin sal");
  await sell(2, [{ paymentMethodId: card, amount: "33000" }]);
  await sell(1, [{ paymentMethodId: cash, amount: "16500" }]);
  // 29/09/2026 a las 11:30 p. m. en Bogotá (30/09 04:30 UTC).
  await db.sale.update({
    where: { id: saleIds[3] },
    data: { createdAt: new Date("2026-09-30T04:30:00Z") },
  });
});
afterAll(() => cleanupCompanies(tag));

const numbers = async (query: Parameters<typeof getSalesOverview>[1], session = admin) =>
  (await getSalesOverview(session, query)).sales.map((sale) => sale.number);

describe("lista de ventas", () => {
  it("por defecto muestra hoy, la más reciente primero, con su resumen", async () => {
    const overview = await getSalesOverview(admin, {});
    expect(overview.filters.from).toBe(overview.today);
    expect(overview.sales.map((s) => [s.number, s.cashierName, s.items, s.paymentMethods])).toEqual([
      [2, "Ana Cajera", "2 × Arepa", "Tarjeta"],
      [1, "Ana Cajera", "1 × Arepa", "Efectivo"],
    ]);
    expect(overview.summary).toEqual({
      completedCount: 2,
      completedTotal: "49500",
      voidedCount: 0,
      voidedTotal: "0",
      byMethod: [
        { name: "Efectivo", amount: "16500" },
        { name: "Tarjeta", amount: "33000" },
      ],
    });
    expect(overview.cashiers.map((c) => c.name)).toEqual(["Ana Cajera"]);
    // Una sola sucursal: sin filtro de sucursal.
    expect(overview.branches).toEqual([]);
  });

  it("el día se cuenta en la zona horaria de la empresa", async () => {
    expect(await numbers({ desde: "2026-09-29", hasta: "2026-09-29" })).toEqual([3]);
    expect(await numbers({ desde: "2026-09-30", hasta: "2026-09-30" })).toEqual([]);
    // Fechas invertidas se ordenan; inválidas vuelven a hoy.
    expect(await numbers({ desde: "2026-09-30", hasta: "2026-09-29" })).toEqual([3]);
    expect(await numbers({ desde: "2026-02-30" })).toEqual([2, 1]);
  });

  it("filtra por cajero y no cruza empresas", async () => {
    expect(await numbers({ cajero: cashier.user.id })).toEqual([2, 1]);
    expect(await numbers({ cajero: admin.user.id })).toEqual([]);
    const other = await getSalesOverview(sessionFor(b, "x", "OWNER"), {
      desde: "2026-09-01",
      hasta: "2026-12-31",
    });
    expect(other.sales).toEqual([]);
    expect(other.summary.completedCount).toBe(0);
    expect(await findSaleByNumber(sessionFor(b, "x", "OWNER"), "1")).toBeNull();
    expect(await getSaleDetail(sessionFor(b, "x", "OWNER"), saleIds[1])).toBeNull();
  });

  it("busca por número", async () => {
    expect(await findSaleByNumber(admin, "#2")).toBe(saleIds[2]);
    expect(await findSaleByNumber(admin, " 3 ")).toBe(saleIds[3]);
    expect(await findSaleByNumber(admin, "999")).toBeNull();
    expect(await findSaleByNumber(admin, "abc")).toBeNull();
    expect(await findSaleByNumber(admin, "1.5")).toBeNull();
  });

  it("solo propietario y administrador ven las ventas", async () => {
    await expect(getSalesOverview(cashier, {})).rejects.toThrow(ForbiddenError);
    await expect(getSaleDetail(cashier, saleIds[1])).rejects.toThrow(ForbiddenError);
    await expect(findSaleByNumber(cashier, "1")).rejects.toThrow(ForbiddenError);
  });
});

describe("detalle y anulación", () => {
  it("muestra líneas, pagos, cambio e inventario descontado", async () => {
    const detail = (await getSaleDetail(admin, saleIds[1]))!;
    expect(detail.canVoid).toBe(true);
    expect(detail.sale).toMatchObject({
      number: 1,
      total: "16500",
      change: "3500",
      cashierName: "Ana Cajera",
      voided: null,
      shift: { open: true },
      lines: [{ productName: "Arepa", quantity: 1, unitPrice: "16500", note: "sin sal" }],
      payments: [{ methodName: "Efectivo", amount: "16500", tendered: "20000" }],
      consumed: [{ supplyName: "Harina", warehouseName: "Bodega principal", quantity: "0.12" }],
      returned: [],
    });
  });

  it("valida el motivo y solo anula quien tiene sales.void", async () => {
    expect(await voidSaleFromPanel(admin, saleIds[1], { reason: " x " })).toEqual({
      ok: false,
      fieldErrors: { reason: "Escribe el motivo de la anulación (mínimo 3 caracteres)." },
    });
    await expect(
      voidSaleFromPanel(cashier, saleIds[1], { reason: "Cobro duplicado" }),
    ).rejects.toThrow(ForbiddenError);
    expect(
      await voidSaleFromPanel(sessionFor(b, "x", "OWNER"), saleIds[1], { reason: "Ajena" }),
    ).toEqual({ ok: false, error: "La venta ya no existe. Actualiza la página.", fieldErrors: {} });
  });

  it("anula: devuelve el inventario y sale del resumen", async () => {
    expect(await voidSaleFromPanel(admin, saleIds[1], { reason: " Cobro duplicado " })).toEqual({
      ok: true,
    });
    const detail = (await getSaleDetail(admin, saleIds[1]))!;
    expect(detail.canVoid).toBe(false);
    expect(detail.sale.voided).toMatchObject({ reason: "Cobro duplicado" });
    expect(detail.sale.returned).toMatchObject([{ supplyName: "Harina", quantity: "0.12" }]);
    // 10 − 4 × 0,12 + 0,12
    const level = await db.stockLevel.findFirstOrThrow({ where: { supplyId: harina } });
    expect(level.quantity.toString()).toBe("9.64");

    const overview = await getSalesOverview(admin, {});
    expect(overview.summary).toMatchObject({
      completedCount: 1,
      completedTotal: "33000",
      voidedCount: 1,
      voidedTotal: "16500",
      byMethod: [{ name: "Tarjeta", amount: "33000" }],
    });
    expect(overview.sales.find((s) => s.number === 1)?.voided).toBe(true);
    expect(await numbers({ estado: "anuladas" })).toEqual([1]);
    expect(await numbers({ estado: "completadas" })).toEqual([2]);

    expect(await voidSaleFromPanel(admin, saleIds[1], { reason: "Otra vez" })).toEqual({
      ok: false,
      error: "Esta venta ya estaba anulada.",
      fieldErrors: {},
    });
  });

  it("con el turno cerrado ya no se anula", async () => {
    expect(await closeShift(cashier, { countedCash: "16500", closingNote: "" })).toMatchObject({
      ok: true,
    });
    // El esperado no cuenta la venta anulada: solo #3 en efectivo.
    const shift = await db.cashSession.findFirstOrThrow({ where: { companyId: a.id } });
    expect(shift.expectedCash?.toString()).toBe("16500");

    const detail = (await getSaleDetail(admin, saleIds[2]))!;
    expect(detail.canVoid).toBe(false);
    expect(detail.sale.shift.open).toBe(false);
    expect(await voidSaleFromPanel(admin, saleIds[2], { reason: "Tarde" })).toEqual({
      ok: false,
      error: "El turno de esta venta ya se cerró: no se puede anular.",
      fieldErrors: {},
    });
  });
});
