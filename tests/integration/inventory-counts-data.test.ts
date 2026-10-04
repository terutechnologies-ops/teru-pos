import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { openCashSession } from "@/server/data/cash-sessions";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import {
  confirmInventoryCount,
  createInventoryCountDraft,
  deleteInventoryCountDraft,
  findInventoryCount,
  saveInventoryCountLines,
  type CountEntry,
} from "@/server/data/inventory-counts";
import {
  createSupply,
  createWarehouse,
  recordStockMovement,
  setSupplyArchived,
  setWarehouseActive,
} from "@/server/data/inventory";
import { createDefaultPaymentMethods, listPaymentMethods } from "@/server/data/payment-methods";
import { addPurchaseLine, confirmPurchase, createPurchaseDraft } from "@/server/data/purchases";
import { addRecipeItem } from "@/server/data/recipes";
import { createSale, voidSale } from "@/server/data/sales";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("countsdata");
let companyId: string;
let otherCompanyId: string;
let otherWarehouseId: string;
let userId: string;
let mainId: string;
let branchId: string;
let harina: string;
let queso: string;
let azucar: string;

async function supply(name: string, unit: "KG" | "G" | "UNIT", unitCost: string | null, initial?: string) {
  const { id } = await createSupply(companyId, { name, unit, minStock: null, unitCost });
  if (initial) {
    const result = await recordStockMovement(companyId, {
      warehouseId: mainId,
      supplyId: id!,
      type: "INITIAL",
      quantity: initial,
      reason: null,
      userId,
    });
    if (result.status !== "OK") throw new Error(result.status);
  }
  return id!;
}

async function warehouse(name: string) {
  await createWarehouse(companyId, branchId, name);
  return (await db.warehouse.findFirstOrThrow({ where: { companyId, name } })).id;
}

async function draft(warehouseId = mainId) {
  const result = await createInventoryCountDraft(companyId, { warehouseId, userId });
  if (result.status !== "OK") throw new Error(result.status);
  return result.countId;
}

// Con la unidad vigente de cada insumo (la que vería quien cuenta).
async function save(countId: string, entries: Record<string, string | null>) {
  const supplies = await db.supply.findMany({
    where: { id: { in: Object.keys(entries) } },
    select: { id: true, unit: true },
  });
  const units = new Map(supplies.map((s) => [s.id, s.unit]));
  const list: CountEntry[] = Object.entries(entries).map(([supplyId, countedQuantity]) => ({
    supplyId,
    countedQuantity,
    unit: units.get(supplyId) ?? "KG",
  }));
  return saveInventoryCountLines(companyId, countId, list);
}

async function confirm(countId: string) {
  return confirmInventoryCount(companyId, { countId, userId });
}

const stock = async (supplyId: string, warehouseId = mainId) =>
  (
    await db.stockLevel.findUnique({ where: { warehouseId_supplyId: { warehouseId, supplyId } } })
  )?.quantity.toString() ?? null;

const countMovements = (countId: string) =>
  db.stockMovement.findMany({
    where: { inventoryCountId: countId },
    orderBy: { supplyId: "asc" },
    select: { supplyId: true, type: true, quantity: true, balanceAfter: true, createdAt: true },
  });

async function lineOf(countId: string, supplyId: string) {
  const line = await db.inventoryCountLine.findUniqueOrThrow({
    where: { countId_supplyId: { countId, supplyId } },
  });
  const text = (value: { toString(): string } | null) => value?.toString() ?? null;
  return {
    counted: text(line.countedQuantity),
    system: text(line.systemQuantity),
    difference: text(line.difference),
    unitCost: text(line.unitCost),
    periodStart: line.periodStart,
    previousCounted: text(line.previousCounted),
    sold: text(line.soldQuantity),
    purchased: text(line.purchasedQuantity),
    adjusted: text(line.adjustedQuantity),
  };
}

beforeAll(async () => {
  companyId = (await createCompany(`${tag}-a`)).id;
  otherCompanyId = (await createCompany(`${tag}-b`)).id;
  const main = await createMainBranch(companyId);
  mainId = main.warehouseId;
  branchId = main.branchId;
  otherWarehouseId = (await createMainBranch(otherCompanyId)).warehouseId;
  userId = (await createUser({ companyId, email: `admin@${tag}.co`, role: "ADMIN" })).id;

  harina = await supply("Harina", "KG", "3000", "10");
  queso = await supply("Queso", "KG", null, "5");
  azucar = await supply("Azúcar", "KG", "4000");
});
afterAll(() => cleanupCompanies(tag));

describe("borrador", () => {
  it("una sola bodega activa de la empresa, con un solo borrador", async () => {
    const countId = await draft();
    expect(await createInventoryCountDraft(companyId, { warehouseId: mainId, userId })).toEqual({
      status: "DRAFT_EXISTS",
      countId,
    });
    expect(
      await createInventoryCountDraft(companyId, { warehouseId: otherWarehouseId, userId }),
    ).toEqual({ status: "WAREHOUSE_NOT_FOUND" });

    const secondary = await warehouse("Bodega inactiva");
    await setWarehouseActive(companyId, secondary, false);
    expect(await createInventoryCountDraft(companyId, { warehouseId: secondary, userId })).toEqual({
      status: "WAREHOUSE_INACTIVE",
    });

    expect(await deleteInventoryCountDraft(companyId, countId)).toEqual({ status: "OK" });
    expect(await db.inventoryCount.count({ where: { id: countId } })).toBe(0);
  });

  it("guarda lo contado y quita lo que queda en blanco", async () => {
    const countId = await draft();
    expect(await save(countId, { [harina]: "9.5", [queso]: "5" })).toEqual({ status: "OK" });
    expect(await save(countId, { [harina]: "9.25", [queso]: null })).toEqual({ status: "OK" });
    const lines = await db.inventoryCountLine.findMany({ where: { countId } });
    expect(lines.map((line) => [line.supplyId, line.countedQuantity.toString(), line.unit])).toEqual([
      [harina, "9.25", "KG"],
    ]);

    const ajeno = (
      await createSupply(otherCompanyId, { name: "Ajeno", unit: "KG", minStock: null, unitCost: null })
    ).id!;
    expect(await save(countId, { [ajeno]: "1" })).toEqual({
      status: "SUPPLY_NOT_FOUND",
      supplyId: ajeno,
    });
    const archivado = await supply("Archivado", "KG", null);
    await setSupplyArchived(companyId, archivado, true);
    expect(await save(countId, { [harina]: "1", [archivado]: "1" })).toEqual({
      status: "SUPPLY_ARCHIVED",
      supplyId: archivado,
    });
    // El rechazo no deja nada a medias.
    expect((await lineOf(countId, harina)).counted).toBe("9.25");
    // La unidad que vio quien contó ya no es la del insumo.
    expect(
      await saveInventoryCountLines(companyId, countId, [
        { supplyId: harina, countedQuantity: "9000", unit: "G" },
      ]),
    ).toEqual({ status: "UNIT_CHANGED", supplyId: harina });
    expect((await lineOf(countId, harina)).counted).toBe("9.25");

    // Otra empresa no ve el borrador.
    expect(await saveInventoryCountLines(otherCompanyId, countId, [])).toEqual({
      status: "NOT_FOUND",
    });
    expect(await deleteInventoryCountDraft(otherCompanyId, countId)).toEqual({
      status: "NOT_FOUND",
    });
    expect(await confirmInventoryCount(otherCompanyId, { countId, userId })).toEqual({
      status: "NOT_FOUND",
    });
    await deleteInventoryCountDraft(companyId, countId);
  });

  it("guarda muchos insumos de una vez; un repetido vale por su último valor", async () => {
    const countId = await draft();
    const many: string[] = [];
    for (let i = 0; i < 40; i++) many.push(await supply(`Lote ${i}`, "UNIT", null));
    expect(await save(countId, { [harina]: "3", ...Object.fromEntries(many.map((id) => [id, "1"])) })).toEqual(
      { status: "OK" },
    );
    expect(await db.inventoryCountLine.count({ where: { countId } })).toBe(41);

    // Los insumos que no vienen no se tocan.
    expect(
      await saveInventoryCountLines(companyId, countId, [
        { supplyId: many[0], countedQuantity: "2", unit: "UNIT" },
        { supplyId: many[0], countedQuantity: "4", unit: "UNIT" },
        { supplyId: many[1], countedQuantity: null, unit: "UNIT" },
      ]),
    ).toEqual({ status: "OK" });
    expect(await db.inventoryCountLine.count({ where: { countId } })).toBe(40);
    expect((await lineOf(countId, many[0])).counted).toBe("4");
    expect((await lineOf(countId, harina)).counted).toBe("3");

    await deleteInventoryCountDraft(companyId, countId);
    for (const id of many) await setSupplyArchived(companyId, id, true);
  });

  it("sin líneas no se confirma", async () => {
    const countId = await draft();
    expect(await confirm(countId)).toEqual({ status: "EMPTY" });
    await deleteInventoryCountDraft(companyId, countId);
  });
});

describe("confirmar", () => {
  let firstCount: string;

  it("ajusta la diferencia, sirve de carga inicial y guarda lo que había", async () => {
    firstCount = await draft();
    // Harina: hay 10, se cuentan 9,5. Queso: cuadra. Azúcar: sin carga inicial.
    await save(firstCount, { [harina]: "9.5", [queso]: "5", [azucar]: "2" });
    const result = await confirm(firstCount);
    expect(result.status).toBe("OK");
    const number = result.status === "OK" ? result.number : 0;
    expect(number).toBeGreaterThan(0);

    expect([await stock(harina), await stock(queso), await stock(azucar)]).toEqual(["9.5", "5", "2"]);
    const movements = await countMovements(firstCount);
    const expected = [
      [harina, "COUNT", "-0.5", "9.5"],
      [azucar, "COUNT", "2", "2"],
    ].sort((x, y) => x[0].localeCompare(y[0]));
    expect(
      movements.map((m) => [m.supplyId, m.type, m.quantity.toString(), m.balanceAfter.toString()]),
    ).toEqual(expected);

    const count = await findInventoryCount(companyId, firstCount);
    expect(count?.status).toBe("CONFIRMED");
    expect(count?.number).toBe(number);
    expect(count?.confirmedBy?.name).toBeTruthy();
    // Los movimientos llevan la hora de la confirmación.
    expect(movements.every((m) => m.createdAt.getTime() === count!.confirmedAt!.getTime())).toBe(true);

    expect(await lineOf(firstCount, harina)).toEqual({
      counted: "9.5",
      system: "10",
      difference: "-0.5",
      unitCost: "3000",
      periodStart: null,
      previousCounted: null,
      sold: "0",
      purchased: "0",
      adjusted: "10",
    });
    expect(await lineOf(firstCount, queso)).toMatchObject({ system: "5", difference: "0", unitCost: null });
    expect(await lineOf(firstCount, azucar)).toMatchObject({ system: "0", difference: "2", adjusted: "0" });
  });

  it("confirmado no cambia ni se borra", async () => {
    expect(await confirm(firstCount)).toEqual({ status: "NOT_DRAFT" });
    expect(await save(firstCount, { [harina]: "1" })).toEqual({ status: "NOT_DRAFT" });
    expect(await deleteInventoryCountDraft(companyId, firstCount)).toEqual({ status: "NOT_DRAFT" });
  });

  it("mide el período desde el conteo anterior: ventas, compras y ajustes", async () => {
    // Venta: arepa con 200 g de harina.
    await db.$transaction((tx) => createDefaultPaymentMethods(tx, companyId));
    const cash = (await listPaymentMethods(companyId)).find((m) => m.isCash)!.id;
    await createProductCategory(companyId, "Menú");
    const category = await db.productCategory.findFirstOrThrow({ where: { companyId } });
    const { id: arepa } = await createProduct(companyId, {
      categoryId: category.id,
      name: "Arepa",
      description: null,
      price: "1000",
    });
    await addRecipeItem(companyId, arepa!, harina, { quantity: "200", unit: "G" });
    const session = await openCashSession(companyId, { userId, branchId, openingAmount: "0" });
    if (session.status !== "OK") throw new Error(session.status);
    const sell = async (quantity: number) => {
      const sale = await createSale(companyId, {
        cashSessionId: session.cashSessionId,
        userId,
        lines: [{ productId: arepa!, quantity, note: null }],
        payments: [{ paymentMethodId: cash, amount: String(quantity * 1000), tendered: null }],
      });
      if (sale.status !== "OK") throw new Error(sale.status);
      return sale.saleId;
    };
    await sell(2); // −0,4 kg
    const voided = await sell(1); // −0,2 kg y luego +0,2 kg al anular
    expect((await voidSale(companyId, { saleId: voided, userId, reason: "Error" })).status).toBe("OK");

    // Compra de 5 kg.
    const supplierId = (
      await db.thirdParty.create({ data: { companyId, name: "Molino", isSupplier: true } })
    ).id;
    const purchase = await createPurchaseDraft(companyId, {
      supplierId,
      warehouseId: mainId,
      supplierInvoice: null,
      purchasedOn: new Date("2026-10-03T00:00:00Z"),
      userId,
    });
    if (purchase.status !== "OK") throw new Error(purchase.status);
    await addPurchaseLine(companyId, purchase.purchaseId, {
      supplyId: harina,
      quantity: "5",
      unit: "KG",
      lineTotal: "15000",
    });
    expect((await confirmPurchase(companyId, { purchaseId: purchase.purchaseId, userId })).status).toBe("OK");

    // Ajuste: salida de 0,1 kg.
    await recordStockMovement(companyId, {
      warehouseId: mainId,
      supplyId: harina,
      type: "ADJUSTMENT",
      quantity: "-0.1",
      reason: "Se mojó",
      userId,
    });

    // Sistema: 9,5 − 0,4 + 5 − 0,1 = 14. Se cuentan 13,8.
    const secondCount = await draft();
    await save(secondCount, { [harina]: "13.8" });
    expect((await confirm(secondCount)).status).toBe("OK");
    const first = await findInventoryCount(companyId, firstCount);
    const line = await lineOf(secondCount, harina);
    expect(line).toEqual({
      counted: "13.8",
      system: "14",
      difference: "-0.2",
      unitCost: "3000",
      periodStart: first!.confirmedAt,
      previousCounted: "9.5",
      sold: "0.4",
      purchased: "5",
      adjusted: "-0.1",
    });
    expect(await stock(harina)).toBe("13.8");
  });
});

describe("nada a medias", () => {
  it("con un insumo archivado o de unidad cambiada no escribe nada", async () => {
    const sal = await supply("Sal", "KG", null);
    const countId = await draft();
    await save(countId, { [harina]: "1", [sal]: "3" });
    await setSupplyArchived(companyId, sal, true);
    expect(await confirm(countId)).toEqual({ status: "SUPPLY_ARCHIVED", supplyId: sal });
    expect(await stock(harina)).toBe("13.8");
    expect(await countMovements(countId)).toEqual([]);
    expect((await findInventoryCount(companyId, countId))?.status).toBe("DRAFT");

    await save(countId, { [sal]: null });
    const pimienta = await supply("Pimienta", "KG", null);
    await save(countId, { [pimienta]: "0.5" });
    // Sin movimientos, la unidad del insumo todavía puede cambiar.
    await db.supply.update({ where: { id: pimienta }, data: { unit: "G" } });
    expect(await confirm(countId)).toEqual({ status: "UNIT_CHANGED", supplyId: pimienta });
    expect(await stock(harina)).toBe("13.8");
    await deleteInventoryCountDraft(companyId, countId);
  });

  it("no confirma en una bodega desactivada", async () => {
    const secondary = await warehouse("Bodega de paso");
    const countId = await draft(secondary);
    await save(countId, { [harina]: "0" });
    expect(await setWarehouseActive(companyId, secondary, false)).toBe("OK");
    expect(await confirm(countId)).toEqual({ status: "WAREHOUSE_INACTIVE" });
    expect(await stock(harina, secondary)).toBeNull();
  });
});

describe("concurrencia", () => {
  it("dos confirmaciones del mismo borrador: solo una pasa", async () => {
    const countId = await draft();
    await save(countId, { [queso]: "4" });
    const results = await Promise.all([confirm(countId), confirm(countId)]);
    expect(results.map((r) => r.status).sort()).toEqual(["NOT_DRAFT", "OK"]);
    expect(await countMovements(countId)).toHaveLength(1);
    expect(await stock(queso)).toBe("4");
  });

  it("conteos simultáneos de dos bodegas: consecutivo sin huecos", async () => {
    const secondary = await warehouse("Bodega dos");
    const before = (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
      .lastInventoryCountNumber;
    const one = await draft();
    const two = await draft(secondary);
    await save(one, { [azucar]: "1" });
    await save(two, { [azucar]: "1" });
    const results = await Promise.all([confirm(one), confirm(two)]);
    const numbers = results.map((r) => (r.status === "OK" ? r.number : 0)).sort();
    expect(numbers).toEqual([before + 1, before + 2]);
  });
});

describe("reglas de la base de datos", () => {
  it("rechaza datos inconsistentes", async () => {
    const countId = await draft();
    // Un segundo borrador para la misma bodega.
    await expect(
      db.inventoryCount.create({ data: { companyId, warehouseId: mainId, createdById: userId } }),
    ).rejects.toThrow();
    // Un movimiento de conteo sin su conteo, y un ajuste enlazado a un conteo.
    await expect(
      db.stockMovement.create({
        data: {
          companyId,
          warehouseId: mainId,
          supplyId: harina,
          type: "COUNT",
          quantity: "1",
          balanceAfter: "1",
          userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.stockMovement.create({
        data: {
          companyId,
          warehouseId: mainId,
          supplyId: harina,
          type: "ADJUSTMENT",
          quantity: "1",
          balanceAfter: "1",
          userId,
          reason: "x",
          inventoryCountId: countId,
        },
      }),
    ).rejects.toThrow();
    // Confirmado sin número; línea con diferencia que no cuadra.
    await expect(
      db.inventoryCount.update({
        where: { id: countId },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: userId },
      }),
    ).rejects.toThrow();
    await save(countId, { [harina]: "2" });
    const line = await db.inventoryCountLine.findFirstOrThrow({ where: { countId } });
    await expect(
      db.inventoryCountLine.update({
        where: { id: line.id },
        data: {
          systemQuantity: "1",
          difference: "5",
          soldQuantity: "0",
          purchasedQuantity: "0",
          adjustedQuantity: "0",
        },
      }),
    ).rejects.toThrow();
    // Lo contado no es negativo.
    await expect(
      db.inventoryCountLine.update({ where: { id: line.id }, data: { countedQuantity: "-1" } }),
    ).rejects.toThrow();
    await deleteInventoryCountDraft(companyId, countId);
  });
});
