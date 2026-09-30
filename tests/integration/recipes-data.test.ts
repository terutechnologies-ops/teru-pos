import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import {
  createSupply,
  recordStockMovement,
  setSupplyArchived,
  updateSupply,
} from "@/server/data/inventory";
import {
  addRecipeItem,
  listRecipeItems,
  removeRecipeItem,
  updateRecipeItem,
} from "@/server/data/recipes";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("recipes");
let a: { id: string };
let b: { id: string };
let arepa: string;
let arepaB: string;
let harina: string;
let queso: string;
let gaseosa: string;
let harinaB: string;

async function newProduct(companyId: string, name: string) {
  await createProductCategory(companyId, "Menú");
  const category = await db.productCategory.findFirstOrThrow({ where: { companyId } });
  const { id } = await createProduct(companyId, {
    categoryId: category.id,
    name,
    description: null,
    price: "16500",
  });
  return id!;
}

async function newSupply(companyId: string, name: string, unit: "KG" | "G" | "UNIT") {
  const { id } = await createSupply(companyId, { name, unit, minStock: null });
  return id!;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  arepa = await newProduct(a.id, "Arepa de queso");
  arepaB = await newProduct(b.id, "Arepa de queso");
  harina = await newSupply(a.id, "Harina", "KG");
  queso = await newSupply(a.id, "Queso", "G");
  gaseosa = await newSupply(a.id, "Gaseosa", "UNIT");
  harinaB = await newSupply(b.id, "Harina", "KG");
});
afterAll(() => cleanupCompanies(tag));

describe("líneas de receta", () => {
  it("se agregan con una unidad de la familia del insumo, una vez por producto", async () => {
    // 120 g de un insumo que se lleva en kg.
    expect(await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" })).toBe("OK");
    expect(await addRecipeItem(a.id, arepa, queso, { quantity: "0.05", unit: "KG" })).toBe("OK");
    expect(await addRecipeItem(a.id, arepa, harina, { quantity: "1", unit: "KG" })).toBe(
      "ALREADY_IN_RECIPE",
    );
    expect(await addRecipeItem(a.id, arepa, gaseosa, { quantity: "1", unit: "G" })).toBe(
      "UNIT_MISMATCH",
    );

    const items = await listRecipeItems(a.id, arepa);
    expect(items.map((i) => [i.supply.name, i.quantity.toString(), i.unit])).toEqual([
      ["Harina", "120", "G"],
      ["Queso", "0.05", "KG"],
    ]);
  });

  it("no cruzan empresas", async () => {
    expect(await addRecipeItem(b.id, arepa, harinaB, { quantity: "1", unit: "KG" })).toBe(
      "PRODUCT_NOT_FOUND",
    );
    expect(await addRecipeItem(a.id, arepa, harinaB, { quantity: "1", unit: "KG" })).toBe(
      "SUPPLY_NOT_FOUND",
    );
    // La FK compuesta lo impide aunque se salte la capa de datos.
    await expect(
      db.productRecipeItem.create({
        data: { companyId: b.id, productId: arepa, supplyId: harinaB, quantity: "1", unit: "KG" },
      }),
    ).rejects.toThrow();

    const [line] = await listRecipeItems(a.id, arepa);
    expect(await updateRecipeItem(b.id, line.id, { quantity: "1", unit: "KG" })).toBe("NOT_FOUND");
    expect(await removeRecipeItem(b.id, line.id)).toBe("NOT_FOUND");
    expect(await listRecipeItems(b.id, arepa)).toEqual([]);
    expect(await listRecipeItems(a.id, arepaB)).toEqual([]);
  });

  it("se cambian y se quitan", async () => {
    const [line] = await listRecipeItems(a.id, arepa);
    expect(await updateRecipeItem(a.id, line.id, { quantity: "0.125", unit: "KG" })).toBe("OK");
    expect(await updateRecipeItem(a.id, line.id, { quantity: "1", unit: "UNIT" })).toBe(
      "UNIT_MISMATCH",
    );
    expect((await listRecipeItems(a.id, arepa))[0]).toMatchObject({ unit: "KG" });

    expect(await addRecipeItem(a.id, arepa, gaseosa, { quantity: "1", unit: "UNIT" })).toBe("OK");
    const gaseosaLine = (await listRecipeItems(a.id, arepa)).find((i) => i.supply.id === gaseosa)!;
    expect(await removeRecipeItem(a.id, gaseosaLine.id)).toBe("OK");
    expect(await removeRecipeItem(a.id, gaseosaLine.id)).toBe("NOT_FOUND");
  });

  it("la BD rechaza cantidades en cero o negativas", async () => {
    await expect(
      db.productRecipeItem.create({
        data: { companyId: a.id, productId: arepa, supplyId: gaseosa, quantity: "0", unit: "UNIT" },
      }),
    ).rejects.toThrow();
  });
});

describe("insumos en recetas", () => {
  it("un insumo archivado no se agrega, pero sus líneas se pueden ajustar", async () => {
    const sal = await newSupply(a.id, "Sal", "G");
    expect(await addRecipeItem(a.id, arepa, sal, { quantity: "2", unit: "G" })).toBe("OK");
    expect(await setSupplyArchived(a.id, sal, true)).toBe("OK");

    const salLine = (await listRecipeItems(a.id, arepa)).find((i) => i.supply.id === sal)!;
    expect(salLine.supply.isArchived).toBe(true);
    expect(await updateRecipeItem(a.id, salLine.id, { quantity: "3", unit: "G" })).toBe("OK");

    const otra = await newProduct(a.id, "Arepa sola");
    expect(await addRecipeItem(a.id, otra, sal, { quantity: "2", unit: "G" })).toBe(
      "SUPPLY_ARCHIVED",
    );
  });

  it("con recetas, la unidad del insumo solo cambia dentro de su familia", async () => {
    const data = { name: "Queso", minStock: null } as const;
    expect(await updateSupply(a.id, queso, { ...data, unit: "UNIT" })).toBe("UNIT_IN_RECIPES");
    expect(await updateSupply(a.id, queso, { ...data, unit: "KG" })).toBe("OK");
    // Con movimientos sigue mandando la regla de la fase 5.
    const branch = await createMainBranch(a.id);
    const user = await createUser({ companyId: a.id, email: `${tag}@prueba.test`, role: "ADMIN" });
    await recordStockMovement(a.id, {
      warehouseId: branch.warehouseId,
      supplyId: queso,
      type: "INITIAL",
      quantity: "1",
      reason: null,
      userId: user.id,
    });
    expect(await updateSupply(a.id, queso, { ...data, unit: "G" })).toBe("UNIT_LOCKED");
  });

  it("la BD rechaza costos negativos", async () => {
    await expect(
      db.supply.update({ where: { id: harina }, data: { unitCost: "-1" } }),
    ).rejects.toThrow();
    await db.supply.update({ where: { id: harina }, data: { unitCost: "3200.5" } });
    expect((await listRecipeItems(a.id, arepa))[0].supply.unitCost?.toString()).toBe("3200.5");
  });
});
