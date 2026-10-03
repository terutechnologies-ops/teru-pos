import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  createSupply,
  createWarehouse,
  recordStockMovement,
  setSupplyArchived,
  setWarehouseActive,
} from "@/server/data/inventory";
import {
  addPurchaseLine,
  confirmPurchase,
  createPurchaseDraft,
  deletePurchaseDraft,
  removePurchaseLine,
  updatePurchaseDraft,
  updatePurchaseLine,
  voidPurchase,
  weightedUnitCost,
} from "@/server/data/purchases";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("purchasesdata");
let companyId: string;
let otherCompanyId: string;
let userId: string;
let mainId: string;
let branchId: string;
let supplierId: string;
let otherSupplierId: string;
let harina: string;
let queso: string;
let gaseosa: string;

const day = new Date("2026-10-02T00:00:00Z");

async function supplier(company: string, name: string, data: Partial<{ isArchived: boolean; isSupplier: boolean; isCustomer: boolean }> = {}) {
  return (
    await db.thirdParty.create({
      data: { companyId: company, name, isSupplier: data.isSupplier ?? true, ...data },
    })
  ).id;
}

async function draft(header: Partial<{ supplierId: string; warehouseId: string }> = {}) {
  const result = await createPurchaseDraft(companyId, {
    supplierId: header.supplierId ?? supplierId,
    warehouseId: header.warehouseId ?? mainId,
    supplierInvoice: "FV-100",
    purchasedOn: day,
    userId,
  });
  if (result.status !== "OK") throw new Error(result.status);
  return result.purchaseId;
}

const line = (supplyId: string, quantity: string, unit: "G" | "KG" | "UNIT" | "L", lineTotal: string) => ({
  supplyId,
  quantity,
  unit,
  lineTotal,
});

const stock = async (supplyId: string, warehouseId = mainId) =>
  (
    await db.stockLevel.findUnique({ where: { warehouseId_supplyId: { warehouseId, supplyId } } })
  )?.quantity.toString() ?? null;

const cost = async (supplyId: string) =>
  (await db.supply.findUniqueOrThrow({ where: { id: supplyId } })).unitCost?.toString() ?? null;

beforeAll(async () => {
  companyId = (await createCompany(`${tag}-a`)).id;
  otherCompanyId = (await createCompany(`${tag}-b`)).id;
  const main = await createMainBranch(companyId);
  mainId = main.warehouseId;
  branchId = main.branchId;
  userId = (await createUser({ companyId, email: `admin@${tag}.co`, role: "ADMIN" })).id;

  supplierId = await supplier(companyId, "Distribuidora La 14");
  otherSupplierId = await supplier(otherCompanyId, "Proveedor ajeno");

  const supply = async (name: string, unit: "KG" | "UNIT", unitCost: string | null) =>
    (await createSupply(companyId, { name, unit, minStock: null, unitCost })).id!;
  harina = await supply("Harina", "KG", "3000");
  queso = await supply("Queso", "KG", null);
  gaseosa = await supply("Gaseosa", "UNIT", "2000");
  await recordStockMovement(companyId, {
    warehouseId: mainId,
    supplyId: harina,
    type: "INITIAL",
    quantity: "10",
    reason: null,
    userId,
  });
});
afterAll(() => cleanupCompanies(tag));

describe("costo promedio ponderado", () => {
  const d = (value: string) => new Prisma.Decimal(value);

  it("promedia con la existencia valorizada", () => {
    expect(
      weightedUnitCost({ stockBefore: d("10"), costBefore: d("3000"), quantity: d("5"), lineTotal: d("20000") }).toString(),
    ).toBe("3333.3333");
  });

  it("sin costo previo o sin existencia positiva toma el de la compra", () => {
    expect(
      weightedUnitCost({ stockBefore: d("10"), costBefore: null, quantity: d("4"), lineTotal: d("10000") }).toString(),
    ).toBe("2500");
    expect(
      weightedUnitCost({ stockBefore: d("-2"), costBefore: d("3000"), quantity: d("4"), lineTotal: d("10000") }).toString(),
    ).toBe("2500");
  });
});

describe("borrador", () => {
  it("exige un proveedor vigente y una bodega activa de la empresa", async () => {
    const base = { warehouseId: mainId, supplierInvoice: null, purchasedOn: day, userId };
    const customerOnly = await supplier(companyId, "Solo cliente", { isSupplier: false, isCustomer: true });
    const archived = await supplier(companyId, "Archivado", { isArchived: true });
    for (const id of [otherSupplierId, customerOnly, archived, "no-existe"]) {
      expect(await createPurchaseDraft(companyId, { ...base, supplierId: id })).toEqual({
        status: "SUPPLIER_NOT_FOUND",
      });
    }
    expect(
      await createPurchaseDraft(companyId, { ...base, supplierId, warehouseId: "no-existe" }),
    ).toEqual({ status: "WAREHOUSE_NOT_FOUND" });
  });

  it("agrega, cambia y quita líneas; el total las sigue", async () => {
    const id = await draft();
    expect(await addPurchaseLine(companyId, id, line(harina, "5000", "G", "20000"))).toEqual({ status: "OK" });
    expect(await addPurchaseLine(companyId, id, line(gaseosa, "24", "UNIT", "48000"))).toEqual({ status: "OK" });
    expect(await addPurchaseLine(companyId, id, line(harina, "1", "KG", "1"))).toEqual({
      status: "ALREADY_IN_PURCHASE",
    });
    expect(await addPurchaseLine(companyId, id, line(queso, "2", "L", "1"))).toEqual({
      status: "UNIT_MISMATCH",
    });
    expect((await db.purchase.findUniqueOrThrow({ where: { id } })).total.toString()).toBe("68000");

    const lines = await db.purchaseLine.findMany({ where: { purchaseId: id }, orderBy: { position: "asc" } });
    expect(lines.map((l) => l.position)).toEqual([1, 2]);
    expect(await updatePurchaseLine(companyId, lines[1].id, { quantity: "12", unit: "UNIT", lineTotal: "24000" })).toEqual({
      status: "OK",
    });
    expect(await updatePurchaseLine(companyId, lines[1].id, { quantity: "12", unit: "KG", lineTotal: "1" })).toEqual({
      status: "UNIT_MISMATCH",
    });
    expect(await removePurchaseLine(companyId, lines[0].id)).toEqual({ status: "OK" });
    expect((await db.purchase.findUniqueOrThrow({ where: { id } })).total.toString()).toBe("24000");

    // Otra empresa no toca la compra ni sus líneas.
    expect(await addPurchaseLine(otherCompanyId, id, line(harina, "1", "KG", "1"))).toEqual({ status: "NOT_FOUND" });
    expect(await removePurchaseLine(otherCompanyId, lines[1].id)).toEqual({ status: "NOT_FOUND" });
    expect(await deletePurchaseDraft(otherCompanyId, id)).toEqual({ status: "NOT_FOUND" });

    expect(await deletePurchaseDraft(companyId, id)).toEqual({ status: "OK" });
    expect(await db.purchase.count({ where: { id } })).toBe(0);
  });

  it("no agrega insumos archivados", async () => {
    const viejo = (await createSupply(companyId, { name: "Viejo", unit: "KG", minStock: null, unitCost: null })).id!;
    await setSupplyArchived(companyId, viejo, true);
    const id = await draft();
    expect(await addPurchaseLine(companyId, id, line(viejo, "1", "KG", "1"))).toEqual({ status: "SUPPLY_ARCHIVED" });
    await deletePurchaseDraft(companyId, id);
  });
});

describe("confirmar", () => {
  let confirmedId: string;

  it("sin líneas no se confirma", async () => {
    const id = await draft();
    expect(await confirmPurchase(companyId, { purchaseId: id, userId })).toEqual({ status: "EMPTY" });
    await deletePurchaseDraft(companyId, id);
  });

  it("entra al inventario, promedia el costo y toma el consecutivo", async () => {
    confirmedId = await draft();
    await addPurchaseLine(companyId, confirmedId, line(harina, "5000", "G", "20000"));
    await addPurchaseLine(companyId, confirmedId, line(queso, "4", "KG", "60000"));

    expect(await confirmPurchase(companyId, { purchaseId: confirmedId, userId })).toEqual({
      status: "OK",
      number: 1,
    });
    // 10 kg a $3.000 + 5 kg por $20.000 = 15 kg a $3.333,3333.
    expect(await stock(harina)).toBe("15");
    expect(await cost(harina)).toBe("3333.3333");
    // Sin costo previo: el de la compra.
    expect(await stock(queso)).toBe("4");
    expect(await cost(queso)).toBe("15000");

    const purchase = await db.purchase.findUniqueOrThrow({ where: { id: confirmedId } });
    expect(purchase).toMatchObject({ status: "CONFIRMED", number: 1, confirmedById: userId });
    expect(purchase.total.toString()).toBe("80000");
    const movements = await db.stockMovement.findMany({
      where: { purchaseId: confirmedId },
      orderBy: { supplyId: "asc" },
    });
    expect(movements.map((m) => [m.type, m.quantity.toString()]).sort()).toEqual([
      ["PURCHASE", "4"],
      ["PURCHASE", "5"],
    ]);
  });

  it("confirmada ya no se edita, no se borra ni se vuelve a confirmar", async () => {
    const [first] = await db.purchaseLine.findMany({ where: { purchaseId: confirmedId } });
    expect(await addPurchaseLine(companyId, confirmedId, line(gaseosa, "1", "UNIT", "1"))).toEqual({ status: "NOT_DRAFT" });
    expect(await updatePurchaseLine(companyId, first.id, { quantity: "1", unit: "KG", lineTotal: "1" })).toEqual({
      status: "NOT_DRAFT",
    });
    expect(await removePurchaseLine(companyId, first.id)).toEqual({ status: "NOT_DRAFT" });
    expect(await deletePurchaseDraft(companyId, confirmedId)).toEqual({ status: "NOT_DRAFT" });
    expect(
      await updatePurchaseDraft(companyId, confirmedId, {
        supplierId,
        warehouseId: mainId,
        supplierInvoice: null,
        purchasedOn: day,
      }),
    ).toEqual({ status: "NOT_DRAFT" });
    expect(await confirmPurchase(companyId, { purchaseId: confirmedId, userId })).toEqual({ status: "NOT_DRAFT" });
  });

  it("un borrador borrado no gasta número; dos confirmaciones a la vez, una sola pasa", async () => {
    const deleted = await draft();
    await addPurchaseLine(companyId, deleted, line(gaseosa, "1", "UNIT", "2000"));
    await deletePurchaseDraft(companyId, deleted);

    const id = await draft();
    await addPurchaseLine(companyId, id, line(gaseosa, "24", "UNIT", "48000"));
    const results = await Promise.all([
      confirmPurchase(companyId, { purchaseId: id, userId }),
      confirmPurchase(companyId, { purchaseId: id, userId }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["NOT_DRAFT", "OK"]);
    expect(results.find((r) => r.status === "OK")).toEqual({ status: "OK", number: 2 });
    expect(await stock(gaseosa)).toBe("24");
  });

  it("con un insumo archivado o la bodega inactiva no se confirma nada", async () => {
    await createWarehouse(companyId, branchId, "Congelador");
    const congelador = (await db.warehouse.findFirstOrThrow({ where: { companyId, name: "Congelador" } })).id;
    const id = await draft({ warehouseId: congelador });
    await addPurchaseLine(companyId, id, line(harina, "1", "KG", "3000"));
    expect(await setWarehouseActive(companyId, congelador, false)).toBe("OK");
    expect(await confirmPurchase(companyId, { purchaseId: id, userId })).toEqual({ status: "WAREHOUSE_INACTIVE" });
    await setWarehouseActive(companyId, congelador, true);

    const tomate = (await createSupply(companyId, { name: "Tomate", unit: "KG", minStock: null, unitCost: null })).id!;
    await addPurchaseLine(companyId, id, line(tomate, "1", "KG", "4000"));
    await setSupplyArchived(companyId, tomate, true);
    expect(await confirmPurchase(companyId, { purchaseId: id, userId })).toEqual({
      status: "SUPPLY_ARCHIVED",
      supplyId: tomate,
    });
    // Nada quedó a medias: ni saldo, ni costo, ni movimientos.
    expect(await stock(harina, congelador)).toBeNull();
    expect(await cost(harina)).toBe("3333.3333");
    expect(await db.stockMovement.count({ where: { purchaseId: id } })).toBe(0);
    await deletePurchaseDraft(companyId, id);
  });
});

describe("anular", () => {
  it("saca lo que entró, puede dejar negativo y no toca el costo", async () => {
    const id = await draft();
    await addPurchaseLine(companyId, id, line(queso, "2", "KG", "40000"));
    await confirmPurchase(companyId, { purchaseId: id, userId });
    expect(await stock(queso)).toBe("6");
    // Se consumió casi todo antes de anular.
    await recordStockMovement(companyId, {
      warehouseId: mainId,
      supplyId: queso,
      type: "ADJUSTMENT",
      quantity: "-5",
      reason: "Consumo",
      userId,
    });
    const costBefore = await cost(queso);

    expect(await voidPurchase(companyId, { purchaseId: id, userId, reason: "Factura repetida" })).toEqual({
      status: "OK",
    });
    expect(await stock(queso)).toBe("-1");
    expect(await cost(queso)).toBe(costBefore);
    const voidMovement = await db.stockMovement.findFirstOrThrow({
      where: { purchaseId: id, type: "PURCHASE_VOID" },
    });
    expect(voidMovement.quantity.toString()).toBe("-2");
    expect(voidMovement.reason).toBe("Factura repetida");
    expect(await db.purchase.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "VOIDED",
      voidedById: userId,
      voidReason: "Factura repetida",
    });

    expect(await voidPurchase(companyId, { purchaseId: id, userId, reason: "Otra vez" })).toEqual({
      status: "ALREADY_VOIDED",
    });
  });

  // Compra confirmada en una bodega aparte cuya existencia ya se consumió
  // toda (saldo 0: la bodega se puede desactivar).
  async function consumedPurchaseIn(warehouseName: string) {
    await createWarehouse(companyId, branchId, warehouseName);
    const warehouseId = (
      await db.warehouse.findFirstOrThrow({ where: { companyId, name: warehouseName } })
    ).id;
    const id = await draft({ warehouseId });
    await addPurchaseLine(companyId, id, line(gaseosa, "12", "UNIT", "24000"));
    await confirmPurchase(companyId, { purchaseId: id, userId });
    await recordStockMovement(companyId, {
      warehouseId,
      supplyId: gaseosa,
      type: "ADJUSTMENT",
      quantity: "-12",
      reason: "Consumo",
      userId,
    });
    return { id, warehouseId };
  }

  it("no anula si su bodega quedó inactiva, y no deja nada a medias", async () => {
    const { id, warehouseId } = await consumedPurchaseIn("Cuarto frío");
    expect(await setWarehouseActive(companyId, warehouseId, false)).toBe("OK");

    expect(await voidPurchase(companyId, { purchaseId: id, userId, reason: "Repetida" })).toEqual({
      status: "WAREHOUSE_INACTIVE",
    });
    expect(await stock(gaseosa, warehouseId)).toBe("0");
    expect(await db.stockMovement.count({ where: { purchaseId: id, type: "PURCHASE_VOID" } })).toBe(0);
    expect((await db.purchase.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
  });

  it("anular y desactivar la bodega a la vez nunca deja una bodega inactiva con saldo", async () => {
    for (let round = 0; round < 3; round++) {
      const { id, warehouseId } = await consumedPurchaseIn(`Bodega carrera ${round}`);
      const [voided, deactivated] = await Promise.all([
        voidPurchase(companyId, { purchaseId: id, userId, reason: "Carrera" }),
        setWarehouseActive(companyId, warehouseId, false),
      ]);
      const warehouse = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
      const balance = await stock(gaseosa, warehouseId);
      // Uno de los dos gana; el otro se entera.
      if (warehouse.isActive) {
        expect(voided.status).toBe("OK");
        expect(deactivated).toBe("HAS_STOCK");
        expect(balance).toBe("-12");
      } else {
        expect(voided.status).toBe("WAREHOUSE_INACTIVE");
        expect(balance).toBe("0");
      }
    }
  });

  it("un borrador no se anula y otra empresa no anula", async () => {
    const id = await draft();
    expect(await voidPurchase(companyId, { purchaseId: id, userId, reason: "x" })).toEqual({
      status: "NOT_CONFIRMED",
    });
    expect(await voidPurchase(otherCompanyId, { purchaseId: id, userId, reason: "x" })).toEqual({
      status: "NOT_FOUND",
    });
    await deletePurchaseDraft(companyId, id);
  });
});

describe("reglas de la base", () => {
  it("un movimiento de compra exige su compra", async () => {
    await expect(
      db.stockMovement.create({
        data: {
          companyId,
          warehouseId: mainId,
          supplyId: harina,
          type: "PURCHASE",
          quantity: 1,
          balanceAfter: 1,
          userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("un tercero tiene al menos un papel y nombre y NIT únicos", async () => {
    await expect(
      db.thirdParty.create({ data: { companyId, name: "Sin papel" } }),
    ).rejects.toThrow();
    await expect(supplier(companyId, "DISTRIBUIDORA LA 14")).rejects.toThrow();
    await db.thirdParty.create({ data: { companyId, name: "Con NIT", taxId: "900", isSupplier: true } });
    await expect(
      db.thirdParty.create({ data: { companyId, name: "Otro con NIT", taxId: "900", isSupplier: true } }),
    ).rejects.toThrow();
  });
});
