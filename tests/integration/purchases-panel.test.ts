import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { addCalendarDays, calendarDay } from "@/lib/company-formats";
import type { StaffSessionDto } from "@/server/dto/auth";
import { createSupply, createWarehouse } from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { getSupplyDetail } from "@/server/services/inventory";
import {
  addPurchaseItem,
  confirmPurchaseDraft,
  createPurchase,
  findPurchaseByNumber,
  getPurchase,
  getPurchasesOverview,
  voidConfirmedPurchase,
} from "@/server/services/purchases";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("purchasespanel");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let userA: string;
let userB: string;
let mainA: string;
let otherWarehouseA: string;
let supplierA: string;
let supplierArchived: string;
let harina: string;
let queso: string;

// Las empresas de prueba usan la zona por defecto (Bogotá).
const today = calendarDay(new Date(), "America/Bogota");

function sessionFor(company: Company, userId: string, role: StaffRole = "ADMIN"): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const admin = () => sessionFor(a, userA);

// Compra confirmada de un insumo; devuelve su id y número.
async function purchase(params: {
  supplierId?: string;
  warehouseId?: string;
  daysAgo?: number;
  supplyId?: string;
  quantity?: string;
  lineTotal?: string;
  session?: StaffSessionDto;
}) {
  const session = params.session ?? admin();
  const created = await createPurchase(session, {
    supplierId: params.supplierId ?? supplierA,
    warehouseId: params.warehouseId ?? mainA,
    purchasedOn: addCalendarDays(today, -(params.daysAgo ?? 0)),
    supplierInvoice: "",
  });
  if (!created.ok) throw new Error(JSON.stringify(created));
  const line = await addPurchaseItem(session, created.purchaseId, {
    supplyId: params.supplyId ?? harina,
    quantity: params.quantity ?? "1000",
    unit: "G",
    lineTotal: params.lineTotal ?? "4000",
  });
  if (!line.ok) throw new Error(JSON.stringify(line));
  const confirmed = await confirmPurchaseDraft(session, created.purchaseId);
  if (!confirmed.ok) throw new Error(confirmed.error);
  return { id: created.purchaseId, number: confirmed.number };
}

const stock = async (supplyId: string, warehouseId = mainA) =>
  (
    await db.stockLevel.findUnique({ where: { warehouseId_supplyId: { warehouseId, supplyId } } })
  )?.quantity.toString() ?? null;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  const main = await createMainBranch(a.id);
  mainA = main.warehouseId;
  await createWarehouse(a.id, main.branchId, "Congelador");
  otherWarehouseA = (await db.warehouse.findFirstOrThrow({
    where: { companyId: a.id, name: "Congelador" },
  })).id;
  await createMainBranch(b.id);
  userA = (await createUser({ companyId: a.id, email: `a@${tag}.co`, role: "ADMIN" })).id;
  userB = (await createUser({ companyId: b.id, email: `b@${tag}.co`, role: "OWNER" })).id;
  supplierA = (await db.thirdParty.create({ data: { companyId: a.id, name: "La 14", isSupplier: true } })).id;
  supplierArchived = (
    await db.thirdParty.create({ data: { companyId: a.id, name: "Antiguo", isSupplier: true } })
  ).id;
  for (const [name, set] of [
    ["Harina", (id: string) => (harina = id)],
    ["Queso", (id: string) => (queso = id)],
  ] as const) {
    const { id } = await createSupply(a.id, { name, unit: "G", minStock: null, unitCost: null });
    set(id!);
  }
});
afterAll(() => cleanupCompanies(tag));

describe("compras en el panel", () => {
  it("lista confirmadas y anuladas de los últimos 30 días, con filtros y resumen", async () => {
    const recent = await purchase({ lineTotal: "4000" });
    const fromArchived = await purchase({ supplierId: supplierArchived, daysAgo: 5, lineTotal: "6000" });
    const inFreezer = await purchase({ warehouseId: otherWarehouseA, daysAgo: 2, lineTotal: "1000" });
    const old = await purchase({ daysAgo: 45, lineTotal: "9000" });
    const voided = await purchase({ daysAgo: 1, lineTotal: "2000" });
    expect(await voidConfirmedPurchase(admin(), voided.id, { reason: "Duplicada" })).toEqual({ ok: true });
    await db.thirdParty.update({ where: { id: supplierArchived }, data: { isArchived: true } });
    // Un borrador no aparece.
    await createPurchase(admin(), {
      supplierId: supplierA,
      warehouseId: mainA,
      purchasedOn: today,
      supplierInvoice: "",
    });

    const overview = await getPurchasesOverview(admin(), {});
    expect(overview.filters).toMatchObject({ from: addCalendarDays(today, -29), to: today });
    expect(overview.defaultFrom).toBe(addCalendarDays(today, -29));
    const ids = overview.purchases.map((p) => p.id);
    expect(ids.sort()).toEqual([recent.id, fromArchived.id, inFreezer.id, voided.id].sort());
    expect(overview.purchases.find((p) => p.id === voided.id)?.voided).toBe(true);
    expect(overview.summary).toEqual({
      confirmedCount: 3,
      confirmedTotal: "11000",
      voidedCount: 1,
      voidedTotal: "2000",
    });
    // Proveedores con compras, también el archivado; dos bodegas: se filtra.
    expect(overview.suppliers.map((s) => [s.name, s.isArchived])).toEqual([
      ["Antiguo", true],
      ["La 14", false],
    ]);
    expect(overview.warehouses).toHaveLength(2);

    const only = async (query: Parameters<typeof getPurchasesOverview>[1]) =>
      (await getPurchasesOverview(admin(), query)).purchases.map((p) => p.id);
    expect(await only({ proveedor: supplierArchived })).toEqual([fromArchived.id]);
    expect(await only({ bodega: otherWarehouseA })).toEqual([inFreezer.id]);
    expect(await only({ estado: "anuladas" })).toEqual([voided.id]);
    expect(await only({ desde: addCalendarDays(today, -60), hasta: addCalendarDays(today, -40) })).toEqual([
      old.id,
    ]);
    // El estado no cambia el resumen.
    const filtered = await getPurchasesOverview(admin(), { estado: "anuladas" });
    expect(filtered.summary.confirmedCount).toBe(3);
  });

  it("va a una compra por su número, solo de la empresa", async () => {
    const { id, number } = await purchase({});
    expect(await findPurchaseByNumber(admin(), `#${number}`)).toBe(id);
    expect(await findPurchaseByNumber(admin(), String(number))).toBe(id);
    expect(await findPurchaseByNumber(admin(), "abc")).toBeNull();
    expect(await findPurchaseByNumber(admin(), "999999")).toBeNull();
    expect(await findPurchaseByNumber(sessionFor(b, userB, "OWNER"), String(number))).toBeNull();
  });

  it("anula: saca el inventario (puede quedar negativo), no toca el costo y queda en el detalle", async () => {
    const { id, number } = await purchase({ supplyId: queso, quantity: "500", lineTotal: "10000" });
    const costBefore = (await db.supply.findUniqueOrThrow({ where: { id: queso } })).unitCost?.toString();
    expect(await stock(queso)).toBe("500");
    // Se consumió parte: la anulación deja el saldo en negativo.
    await db.stockLevel.update({
      where: { warehouseId_supplyId: { warehouseId: mainA, supplyId: queso } },
      data: { quantity: "200" },
    });

    expect(await voidConfirmedPurchase(admin(), id, { reason: " a " })).toEqual({
      ok: false,
      fieldErrors: { reason: "Escribe el motivo de la anulación (mínimo 3 caracteres)." },
    });
    expect(await voidConfirmedPurchase(admin(), id, { reason: "El proveedor la devolvió" })).toEqual({
      ok: true,
    });
    expect(await stock(queso)).toBe("-300");
    expect((await db.supply.findUniqueOrThrow({ where: { id: queso } })).unitCost?.toString()).toBe(
      costBefore,
    );

    const detail = await getPurchase(admin(), id);
    expect(detail).toMatchObject({
      status: "VOIDED",
      number,
      draft: null,
      voided: { byName: "Usuario Prueba", reason: "El proveedor la devolvió" },
    });
    expect(detail?.inventory.entered.map((m) => [m.supplyName, m.quantity, m.unit])).toEqual([
      ["Queso", "500", "G"],
    ]);
    expect(detail?.inventory.removed.map((m) => m.quantity)).toEqual(["500"]);

    expect(await voidConfirmedPurchase(admin(), id, { reason: "Otra vez" })).toEqual({
      ok: false,
      fieldErrors: {},
      error: "La compra ya estaba anulada.",
    });
  });

  it("no anula un borrador ni compras de otra empresa", async () => {
    const draft = await createPurchase(admin(), {
      supplierId: supplierA,
      warehouseId: mainA,
      purchasedOn: today,
      supplierInvoice: "",
    });
    if (!draft.ok) throw new Error("borrador");
    expect(await voidConfirmedPurchase(admin(), draft.purchaseId, { reason: "No va" })).toMatchObject({
      ok: false,
      error: "Solo se anula una compra confirmada; un borrador se elimina.",
    });

    const { id } = await purchase({});
    expect(
      await voidConfirmedPurchase(sessionFor(b, userB, "OWNER"), id, { reason: "Ajena" }),
    ).toMatchObject({ ok: false, error: "La compra ya no existe. Actualiza la página." });
    expect((await getPurchase(admin(), id))?.status).toBe("CONFIRMED");
  });

  it("el kardex enlaza cada movimiento con su compra", async () => {
    const { id, number } = await purchase({ supplyId: harina });
    const detail = await getSupplyDetail(admin(), harina);
    expect(detail?.canViewPurchases).toBe(true);
    const movement = detail?.movements.find((m) => m.purchase?.id === id);
    expect(movement).toMatchObject({ kind: "PURCHASE", purchase: { id, number } });
  });

  it("personal y cajeros no ven ni anulan compras", async () => {
    for (const role of ["STAFF", "CASHIER"] as const) {
      const session = sessionFor(a, userA, role);
      await expect(getPurchasesOverview(session, {})).rejects.toThrow(ForbiddenError);
      await expect(findPurchaseByNumber(session, "1")).rejects.toThrow(ForbiddenError);
      await expect(voidConfirmedPurchase(session, "x", { reason: "Prueba" })).rejects.toThrow(
        ForbiddenError,
      );
    }
  });
});
