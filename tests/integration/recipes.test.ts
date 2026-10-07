import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply, setSupplyArchived } from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { getProductCatalog } from "@/server/services/catalog";
import {
  addProductRecipeItem,
  getProductRecipe,
  removeProductRecipeItem,
  updateProductRecipeItem,
} from "@/server/services/recipes";

import { cleanupCompanies, createCompany, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("recipes-svc");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let arepa: string;
let arepaB: string;
let harina: string;
let queso: string;

function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const admin = () => sessionFor(a, "ADMIN");
const ctxA = ctx(tag);

async function newProduct(companyId: string, name: string) {
  await createProductCategory(companyId, "Menú");
  const category = await db.productCategory.findFirstOrThrow({ where: { companyId } });
  return (await createProduct(companyId, { categoryId: category.id, name, description: null, price: "9000" }))
    .id!;
}

async function newSupply(companyId: string, name: string, unit: "KG" | "G" | "UNIT") {
  return (await createSupply(companyId, { name, unit, minStock: null, idealStock: null, unitCost: null })).id!;
}

const add = (fields: { supplyId: string; quantity: string; unit: string }, product = arepa) =>
  addProductRecipeItem(admin(), product, fields, ctxA);
const lines = async () => (await getProductRecipe(admin(), arepa))!.items;
const recipeEvents = () =>
  db.authAuditLog.count({
    where: { action: "PRODUCT_RECIPE_CHANGED", targetType: "PRODUCT", targetId: arepa },
  });

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  arepa = await newProduct(a.id, "Arepa de queso");
  arepaB = await newProduct(b.id, "Arepa de queso");
  harina = await newSupply(a.id, "Harina", "KG");
  queso = await newSupply(a.id, "Queso", "G");
  await newSupply(a.id, "Gaseosa", "UNIT");
});
afterAll(() => cleanupCompanies(tag));

describe("receta del producto (servicio)", () => {
  it("sin receta, el producto no tiene costo", async () => {
    expect((await getProductRecipe(admin(), arepa))!.costing).toEqual({ status: "NO_RECIPE" });
  });

  it("valida la línea y explica la unidad que corresponde", async () => {
    expect(await add({ supplyId: "", quantity: "0", unit: "" })).toEqual({
      ok: false,
      fieldErrors: {
        supplyId: "Elige un insumo.",
        quantity: "La cantidad debe ser mayor que cero.",
        unit: "Elige una unidad.",
      },
    });
    expect(await add({ supplyId: harina, quantity: "1", unit: "UNIT" })).toEqual({
      ok: false,
      fieldErrors: { unit: "El insumo se mide en kg: usa g o kg." },
    });
    expect(await recipeEvents()).toBe(0);
  });

  it("agrega insumos una vez, en cualquier unidad de su familia, y lo audita", async () => {
    expect(await add({ supplyId: harina, quantity: "120", unit: "G" })).toEqual({ ok: true });
    expect(await add({ supplyId: queso, quantity: "50", unit: "G" })).toEqual({ ok: true });
    expect(await add({ supplyId: harina, quantity: "1", unit: "KG" })).toEqual({
      ok: false,
      fieldErrors: { supplyId: "Este insumo ya está en la receta: cambia su cantidad en la lista." },
    });
    expect(await recipeEvents()).toBe(2);

    const recipe = (await getProductRecipe(admin(), arepa))!;
    expect(recipe.items.map((i) => [i.supply.name, i.quantity, i.unit])).toEqual([
      ["Harina", "120", "G"],
      ["Queso", "50", "G"],
    ]);
    // Solo se ofrecen los insumos activos que aún no están.
    expect(recipe.supplyOptions.map((s) => s.name)).toEqual(["Gaseosa"]);
    expect(recipe).toMatchObject({ hasSupplies: true, canViewSupplies: true });
  });

  it("no agrega insumos archivados ni cruza empresas", async () => {
    const sal = await newSupply(a.id, "Sal", "G");
    await setSupplyArchived(a.id, sal, true);
    expect(await add({ supplyId: sal, quantity: "2", unit: "G" })).toEqual({
      ok: false,
      fieldErrors: { supplyId: "El insumo está archivado: restáuralo para usarlo en recetas." },
    });
    expect(await add({ supplyId: harina, quantity: "1", unit: "KG" }, arepaB)).toEqual({
      ok: false,
      fieldErrors: {},
      error: "El producto ya no existe. Actualiza la página.",
    });
    expect(await getProductRecipe(sessionFor(b, "OWNER"), arepa)).toBeNull();

    const [line] = await lines();
    const owner = sessionFor(b, "OWNER");
    const gone = { ok: false, fieldErrors: {}, error: "Este insumo ya no está en la receta. Actualiza la página." };
    expect(await updateProductRecipeItem(owner, line.id, { quantity: "1", unit: "KG" }, ctxA)).toEqual(gone);
    expect(await removeProductRecipeItem(owner, line.id, ctxA)).toEqual(gone);
  });

  it("cambia y quita líneas, y cada cambio se audita", async () => {
    const [harinaLine, quesoLine] = await lines();
    expect(
      await updateProductRecipeItem(admin(), harinaLine.id, { quantity: "0.125", unit: "KG" }, ctxA),
    ).toEqual({ ok: true });
    expect(
      await updateProductRecipeItem(admin(), harinaLine.id, { quantity: "1", unit: "UNIT" }, ctxA),
    ).toEqual({ ok: false, fieldErrors: { unit: "El insumo se mide en kg: usa g o kg." } });
    expect(await removeProductRecipeItem(admin(), quesoLine.id, ctxA)).toEqual({ ok: true });

    expect((await lines()).map((i) => [i.supply.name, i.quantity, i.unit])).toEqual([
      ["Harina", "0.125", "KG"],
    ]);
    expect(await recipeEvents()).toBe(4);
  });

  it("el personal no gestiona recetas", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(getProductRecipe(staff, arepa)).rejects.toThrow(ForbiddenError);
    await expect(
      addProductRecipeItem(staff, arepa, { supplyId: queso, quantity: "1", unit: "G" }, ctxA),
    ).rejects.toThrow(ForbiddenError);
  });

  it("costea la receta con el costo de los insumos, también en la lista", async () => {
    // Receta actual: 0.125 kg de harina. Precio 9000.
    await db.supply.update({ where: { id: harina }, data: { unitCost: "3200" } });
    expect(await add({ supplyId: queso, quantity: "50", unit: "G" })).toEqual({ ok: true });

    let recipe = (await getProductRecipe(admin(), arepa))!;
    expect(recipe.items.map((i) => [i.supply.name, i.cost])).toEqual([
      ["Harina", "400"],
      ["Queso", null],
    ]);
    expect(recipe.costing).toEqual({ status: "INCOMPLETE", cost: "400", missing: 1 });
    expect(recipe).toMatchObject({ currency: "COP", product: { price: "9000" } });

    await db.supply.update({ where: { id: queso }, data: { unitCost: "3.25" } });
    recipe = (await getProductRecipe(admin(), arepa))!;
    // 400 + 50 g × 3,25 = 562,5; margen 8437,5 (93,8 %).
    expect(recipe.costing).toEqual({
      status: "COMPLETE",
      cost: "562.5",
      margin: "8437.5",
      marginPercent: "93.8",
    });

    const { products } = await getProductCatalog(admin(), {});
    expect(products.map((p) => [p.name, p.costing.status])).toEqual([
      ["Arepa de queso", "COMPLETE"],
    ]);
    expect((await getProductCatalog(sessionFor(b, "OWNER"), {})).products[0].costing).toEqual({
      status: "NO_RECIPE",
    });
  });

  it("avisa si la receta usa insumos archivados", async () => {
    expect((await getProductRecipe(admin(), arepa))!.hasArchivedSupplies).toBe(false);
    const [, quesoLine] = await lines();
    await removeProductRecipeItem(admin(), quesoLine.id, ctxA);
    await setSupplyArchived(a.id, queso, true);
    expect(await add({ supplyId: queso, quantity: "1", unit: "G" })).toMatchObject({ ok: false });
    await setSupplyArchived(a.id, queso, false);
    await add({ supplyId: queso, quantity: "1", unit: "G" });
    await setSupplyArchived(a.id, queso, true);
    expect((await getProductRecipe(admin(), arepa))!.hasArchivedSupplies).toBe(true);
  });
});
