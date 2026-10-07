import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { addCalendarDays, calendarDay } from "@/lib/company-formats";
import type { StaffSessionDto } from "@/server/dto/auth";
import { createSupply, createWarehouse, setSupplyArchived } from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  addPurchaseItem,
  confirmPurchaseDraft,
  createPurchase,
  deletePurchase,
  getPurchase,
  getPurchaseDrafts,
  getPurchaseFormOptions,
  removePurchaseItem,
  updatePurchaseHeader,
  updatePurchaseItem,
} from "@/server/services/purchases";
import type {
  PurchaseHeaderFormInput,
  PurchaseItemFormInput,
} from "@/server/validations/purchases";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("purchases");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let userA: string;
let userB: string;
let mainA: string;
let branchA: string;
let mainB: string;
let supplierA: string;
let archivedSupplier: string;
let supplierB: string;
let harina: string;
let queso: string;
let gaseosa: string;

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

async function supplier(companyId: string, name: string, isArchived = false) {
  return (await db.thirdParty.create({ data: { companyId, name, isSupplier: true, isArchived } })).id;
}

async function supply(companyId: string, name: string, unit: "G" | "UNIT") {
  const { id } = await createSupply(companyId, { name, unit, minStock: null, idealStock: null, unitCost: null });
  if (!id) throw new Error(name);
  return id;
}

const header = (fields: Partial<PurchaseHeaderFormInput> = {}): PurchaseHeaderFormInput => ({
  supplierId: supplierA,
  warehouseId: mainA,
  purchasedOn: today,
  supplierInvoice: "FE-1",
  ...fields,
});

const item = (fields: Partial<PurchaseItemFormInput> = {}): PurchaseItemFormInput => ({
  supplyId: harina,
  quantity: "25",
  unit: "KG",
  lineTotal: "80.000",
  ...fields,
});

async function newDraft(session = admin(), fields: Partial<PurchaseHeaderFormInput> = {}) {
  const result = await createPurchase(session, header(fields));
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.purchaseId;
}

const detail = async (id: string, session = admin()) => {
  const purchase = await getPurchase(session, id);
  if (!purchase) throw new Error("sin compra");
  return purchase;
};

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  ({ warehouseId: mainA, branchId: branchA } = await createMainBranch(a.id));
  ({ warehouseId: mainB } = await createMainBranch(b.id));
  userA = (await createUser({ companyId: a.id, email: `a@${tag}.co`, role: "ADMIN" })).id;
  userB = (await createUser({ companyId: b.id, email: `b@${tag}.co`, role: "OWNER" })).id;
  supplierA = await supplier(a.id, "Distribuidora La 14");
  archivedSupplier = await supplier(a.id, "Proveedor viejo", true);
  supplierB = await supplier(b.id, "Proveedor de B");
  harina = await supply(a.id, "Harina", "G");
  queso = await supply(a.id, "Queso", "G");
  gaseosa = await supply(a.id, "Gaseosa", "UNIT");
});
afterAll(() => cleanupCompanies(tag));

describe("compras (servicio)", () => {
  it("ofrece proveedores activos, bodegas activas con la principal propuesta y el día de hoy", async () => {
    const inactive = await createWarehouse(a.id, branchA, "Congelador");
    await db.warehouse.updateMany({ where: { companyId: a.id, name: "Congelador" }, data: { isActive: false } });
    expect(inactive).toBe("OK");

    const options = await getPurchaseFormOptions(admin());
    expect(options.suppliers.map((s) => s.name)).toEqual(["Distribuidora La 14"]);
    expect(options.warehouses.map((w) => w.id)).toEqual([mainA]);
    expect(options.defaultWarehouseId).toBe(mainA);
    expect(options.showBranch).toBe(false);
    expect(options.today).toBe(today);
  });

  it("valida el encabezado: proveedor, bodega, fecha no futura y factura", async () => {
    const invalid = await createPurchase(
      admin(),
      header({
        supplierId: "",
        warehouseId: "",
        purchasedOn: addCalendarDays(today, 1),
        supplierInvoice: "x".repeat(41),
      }),
    );
    expect(invalid).toMatchObject({ ok: false });
    if (!invalid.ok) {
      expect(Object.keys(invalid.fieldErrors).sort()).toEqual([
        "purchasedOn",
        "supplierId",
        "supplierInvoice",
        "warehouseId",
      ]);
      expect(invalid.fieldErrors.purchasedOn).toBe("La fecha no puede ser futura.");
    }
    expect(await createPurchase(admin(), header({ purchasedOn: "2026-02-30" }))).toMatchObject({
      ok: false,
      fieldErrors: { purchasedOn: "Escribe una fecha válida." },
    });
    // Archivado, de otra empresa o bodega ajena: error en su campo.
    for (const supplierId of [archivedSupplier, supplierB]) {
      expect(await createPurchase(admin(), header({ supplierId }))).toMatchObject({
        ok: false,
        fieldErrors: { supplierId: expect.any(String) },
      });
    }
    expect(await createPurchase(admin(), header({ warehouseId: mainB }))).toMatchObject({
      ok: false,
      fieldErrors: { warehouseId: expect.any(String) },
    });
  });

  it("crea el borrador, lo lista y cambia su encabezado", async () => {
    const id = await newDraft(admin(), { purchasedOn: addCalendarDays(today, -3), supplierInvoice: " " });
    let purchase = await detail(id);
    expect(purchase).toMatchObject({
      status: "DRAFT",
      number: null,
      supplierInvoice: null,
      purchasedOnDay: addCalendarDays(today, -3),
      total: "0",
      createdBy: "Usuario Prueba",
    });
    expect(purchase.draft?.availableSupplies.map((s) => s.name)).toEqual(["Gaseosa", "Harina", "Queso"]);

    const { drafts } = await getPurchaseDrafts(admin());
    expect(drafts.find((d) => d.id === id)).toMatchObject({
      supplierName: "Distribuidora La 14",
      lineCount: 0,
    });

    expect(
      await updatePurchaseHeader(admin(), id, header({ purchasedOn: today, supplierInvoice: "FE-99" })),
    ).toEqual({ ok: true, purchaseId: id });
    purchase = await detail(id);
    expect(purchase).toMatchObject({ purchasedOnDay: today, supplierInvoice: "FE-99" });
    expect(
      await updatePurchaseHeader(admin(), id, header({ purchasedOn: addCalendarDays(today, 2) })),
    ).toMatchObject({ ok: false, fieldErrors: { purchasedOn: expect.any(String) } });

    expect(await deletePurchase(admin(), id)).toEqual({ ok: true });
    expect(await getPurchase(admin(), id)).toBeNull();
  });

  it("agrega, cambia y quita líneas con su costo por unidad del insumo", async () => {
    const id = await newDraft();
    // 25 kg por $ 80.000 de un insumo en gramos: $ 3,2 por g.
    expect(await addPurchaseItem(admin(), id, item())).toEqual({ ok: true });
    expect(await addPurchaseItem(admin(), id, item({ supplyId: gaseosa, quantity: "24", unit: "UNIT", lineTotal: "48000" }))).toEqual({ ok: true });

    let purchase = await detail(id);
    expect(purchase.total).toBe("128000");
    expect(purchase.lines.map((l) => [l.supply.name, l.quantity, l.unit, l.lineTotal, l.unitCost])).toEqual([
      ["Harina", "25", "KG", "80000", "3.2"],
      ["Gaseosa", "24", "UNIT", "48000", "2000"],
    ]);
    expect(purchase.lines[0].supply.uninitialized).toBe(true);
    expect(purchase.draft?.availableSupplies.map((s) => s.name)).toEqual(["Queso"]);

    // Errores en su campo.
    expect(await addPurchaseItem(admin(), id, item())).toEqual({
      ok: false,
      fieldErrors: { supplyId: "Este insumo ya está en la compra: cambia su línea." },
    });
    expect(await addPurchaseItem(admin(), id, item({ supplyId: queso, unit: "L" }))).toEqual({
      ok: false,
      fieldErrors: { unit: "El insumo se mide en g: usa g o kg." },
    });
    const invalid = await addPurchaseItem(
      admin(),
      id,
      item({ supplyId: queso, quantity: "0", lineTotal: "1.000,50" }),
    );
    expect(invalid).toMatchObject({
      ok: false,
      fieldErrors: {
        quantity: "La cantidad debe ser mayor que cero.",
        lineTotal: "Esta moneda no usa centavos.",
      },
    });

    const [harinaLine, gaseosaLine] = purchase.lines;
    expect(
      await updatePurchaseItem(admin(), harinaLine.id, { quantity: "20000", unit: "G", lineTotal: "70.000" }),
    ).toEqual({ ok: true });
    expect(
      await updatePurchaseItem(admin(), gaseosaLine.id, { quantity: "1", unit: "KG", lineTotal: "1" }),
    ).toEqual({ ok: false, fieldErrors: { unit: "El insumo se mide en und: usa und." } });
    expect(await removePurchaseItem(admin(), gaseosaLine.id)).toEqual({ ok: true });

    purchase = await detail(id);
    expect(purchase.total).toBe("70000");
    expect(purchase.lines.map((l) => [l.quantity, l.unit, l.unitCost])).toEqual([["20000", "G", "3.5"]]);
    await deletePurchase(admin(), id);
  });

  it("confirma: entra a la bodega, actualiza el costo y queda fija", async () => {
    const id = await newDraft();
    expect(await confirmPurchaseDraft(admin(), id)).toEqual({
      ok: false,
      error: "Agrega al menos un insumo antes de confirmar.",
    });
    await addPurchaseItem(admin(), id, item({ supplyId: queso, quantity: "2", unit: "KG", lineTotal: "36000" }));

    const before = (await getPurchaseDrafts(admin())).drafts.length;
    const result = await confirmPurchaseDraft(admin(), id);
    expect(result).toMatchObject({ ok: true, number: expect.any(Number) });

    const purchase = await detail(id);
    expect(purchase).toMatchObject({ status: "CONFIRMED", draft: null, confirmedBy: "Usuario Prueba" });
    expect(purchase.number).toBe(result.ok ? result.number : null);
    expect((await getPurchaseDrafts(admin())).drafts).toHaveLength(before - 1);

    const queso_ = await db.supply.findUniqueOrThrow({ where: { id: queso } });
    expect(queso_.unitCost?.toString()).toBe("18");
    const level = await db.stockLevel.findUnique({
      where: { warehouseId_supplyId: { warehouseId: mainA, supplyId: queso } },
    });
    expect(level?.quantity.toString()).toBe("2000");

    // Confirmada no cambia.
    const notDraft = "La compra ya fue confirmada y no se puede cambiar. Actualiza la página.";
    expect(await addPurchaseItem(admin(), id, item())).toEqual({ ok: false, fieldErrors: {}, error: notDraft });
    expect(await updatePurchaseHeader(admin(), id, header())).toEqual({
      ok: false,
      fieldErrors: {},
      error: notDraft,
    });
    expect(await deletePurchase(admin(), id)).toEqual({ ok: false, error: notDraft });
    expect(await confirmPurchaseDraft(admin(), id)).toEqual({
      ok: false,
      error: "La compra ya estaba confirmada.",
    });
  });

  it("no confirma con un insumo archivado y lo nombra", async () => {
    const archivable = await supply(a.id, "Salsa vieja", "G");
    const id = await newDraft();
    await addPurchaseItem(admin(), id, item({ supplyId: archivable, quantity: "500", unit: "G", lineTotal: "5000" }));
    expect(await setSupplyArchived(a.id, archivable, true)).toBe("OK");
    expect(await confirmPurchaseDraft(admin(), id)).toEqual({
      ok: false,
      error: "Salsa vieja está archivado: quítalo de la compra o restáuralo.",
    });
    expect((await detail(id)).status).toBe("DRAFT");
    await deletePurchase(admin(), id);
  });

  it("no ve ni toca compras de otra empresa", async () => {
    const id = await newDraft();
    await addPurchaseItem(admin(), id, item({ supplyId: gaseosa, quantity: "1", unit: "UNIT", lineTotal: "2000" }));
    const lineId = (await detail(id)).lines[0].id;
    const other = sessionFor(b, userB, "OWNER");

    expect(await getPurchase(other, id)).toBeNull();
    expect((await getPurchaseDrafts(other)).drafts).toEqual([]);
    expect(await updatePurchaseHeader(other, id, header({ supplierId: supplierB, warehouseId: mainB }))).toMatchObject({ ok: false, error: expect.any(String) });
    expect(await addPurchaseItem(other, id, item())).toMatchObject({ ok: false });
    expect(await updatePurchaseItem(other, lineId, { quantity: "9", unit: "UNIT", lineTotal: "1" })).toMatchObject({ ok: false });
    expect(await removePurchaseItem(other, lineId)).toMatchObject({ ok: false });
    expect(await confirmPurchaseDraft(other, id)).toMatchObject({ ok: false });
    expect(await deletePurchase(other, id)).toMatchObject({ ok: false });

    const purchase = await detail(id);
    expect(purchase.status).toBe("DRAFT");
    expect(purchase.lines.map((l) => l.quantity)).toEqual(["1"]);
    await deletePurchase(admin(), id);
  });

  it("personal y cajeros no gestionan compras", async () => {
    for (const role of ["STAFF", "CASHIER"] as const) {
      const session = sessionFor(a, userA, role);
      await expect(getPurchaseDrafts(session)).rejects.toThrow(ForbiddenError);
      await expect(getPurchaseFormOptions(session)).rejects.toThrow(ForbiddenError);
      await expect(getPurchase(session, "x")).rejects.toThrow(ForbiddenError);
      await expect(createPurchase(session, header())).rejects.toThrow(ForbiddenError);
      await expect(updatePurchaseHeader(session, "x", header())).rejects.toThrow(ForbiddenError);
      await expect(deletePurchase(session, "x")).rejects.toThrow(ForbiddenError);
      await expect(addPurchaseItem(session, "x", item())).rejects.toThrow(ForbiddenError);
      await expect(
        updatePurchaseItem(session, "x", { quantity: "1", unit: "G", lineTotal: "1" }),
      ).rejects.toThrow(ForbiddenError);
      await expect(removePurchaseItem(session, "x")).rejects.toThrow(ForbiddenError);
      await expect(confirmPurchaseDraft(session, "x")).rejects.toThrow(ForbiddenError);
    }
  });
});
