import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createProduct,
  createProductCategory,
  deleteProductCategory,
  findProduct,
  listProductCategories,
  listProducts,
  moveProductCategory,
  renameProductCategory,
  setProductArchived,
  setProductAvailable,
  setProductCategoryActive,
  updateProduct,
} from "@/server/data/catalog";

import { cleanupCompanies, createCompany, uniqueTag } from "../helpers";

const tag = uniqueTag("catalog");
let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => cleanupCompanies(tag));

const categoryId = async (companyId: string, name: string) =>
  (await db.productCategory.findFirstOrThrow({ where: { companyId, name } })).id;
const productId = async (companyId: string, name: string) =>
  (await db.product.findFirstOrThrow({ where: { companyId, name } })).id;

describe("categorías", () => {
  it("se crean al final del orden, con nombre único por empresa sin mayúsculas", async () => {
    expect(await createProductCategory(a.id, "Arepas")).toBe("OK");
    expect(await createProductCategory(a.id, "Bebidas")).toBe("OK");
    expect(await createProductCategory(a.id, "Postres")).toBe("OK");
    expect(await createProductCategory(a.id, "BEBIDAS")).toBe("NAME_TAKEN");
    // El mismo nombre sí vale en otra empresa.
    expect(await createProductCategory(b.id, "Bebidas")).toBe("OK");

    const list = await listProductCategories(a.id);
    expect(list.map((c) => [c.name, c.position])).toEqual([
      ["Arepas", 0],
      ["Bebidas", 1],
      ["Postres", 2],
    ]);
    expect(list.every((c) => c.isActive && c._count.products === 0)).toBe(true);
  });

  it("se renombran, reordenan y desactivan solo dentro de su empresa", async () => {
    const postres = await categoryId(a.id, "Postres");
    expect(await renameProductCategory(a.id, postres, "arepas")).toBe("NAME_TAKEN");
    expect(await renameProductCategory(b.id, postres, "Dulces")).toBe("NOT_FOUND");
    expect(await renameProductCategory(a.id, postres, "Dulces")).toBe("OK");

    expect(await moveProductCategory(a.id, postres, "up")).toBe(true);
    expect(await moveProductCategory(a.id, postres, "up")).toBe(true);
    expect(await moveProductCategory(a.id, postres, "up")).toBe(false);
    expect(await moveProductCategory(b.id, postres, "down")).toBe(false);
    expect((await listProductCategories(a.id)).map((c) => [c.name, c.position])).toEqual([
      ["Dulces", 0],
      ["Arepas", 1],
      ["Bebidas", 2],
    ]);

    expect(await setProductCategoryActive(b.id, postres, false)).toBe(false);
    expect(await setProductCategoryActive(a.id, postres, false)).toBe(true);
    expect((await listProductCategories(a.id))[0].isActive).toBe(false);
  });
});

describe("productos", () => {
  it("se crean con categoría de la misma empresa y nombre único", async () => {
    const arepas = await categoryId(a.id, "Arepas");
    const ajena = await categoryId(b.id, "Bebidas");
    const data = { categoryId: arepas, name: "Reina Pepiada", description: null, price: "16500" };

    expect((await createProduct(a.id, data)).status).toBe("OK");
    expect((await createProduct(a.id, { ...data, name: "reina PEPIADA" })).status).toBe("NAME_TAKEN");
    // La FK compuesta impide una categoría de otra empresa.
    expect((await createProduct(a.id, { ...data, name: "Otra", categoryId: ajena })).status).toBe(
      "CATEGORY_NOT_FOUND",
    );
    expect((await createProduct(a.id, { ...data, name: "Otra", categoryId: "no-existe" })).status).toBe(
      "CATEGORY_NOT_FOUND",
    );
    await expect(
      createProduct(a.id, { ...data, name: "Negativa", price: "-1" }),
    ).rejects.toThrow();

    const product = await findProduct(a.id, await productId(a.id, "Reina Pepiada"));
    expect(product).toMatchObject({
      name: "Reina Pepiada",
      isArchived: false,
      isAvailable: true,
      category: { name: "Arepas" },
    });
    expect(product?.price.toString()).toBe("16500");
  });

  it("se editan, archivan y marcan agotados solo dentro de su empresa", async () => {
    const id = await productId(a.id, "Reina Pepiada");
    const bebidas = await categoryId(a.id, "Bebidas");
    const ajena = await categoryId(b.id, "Bebidas");
    const edit = { categoryId: bebidas, name: "Reina", description: "Con aguacate", price: "17000.50" };

    expect(await updateProduct(b.id, id, edit)).toBe("NOT_FOUND");
    expect(await updateProduct(a.id, id, { ...edit, categoryId: ajena })).toBe(
      "CATEGORY_NOT_FOUND",
    );
    expect(await updateProduct(a.id, id, edit)).toBe("OK");
    expect((await findProduct(a.id, id))?.price.toString()).toBe("17000.5");
    expect(await findProduct(b.id, id)).toBeNull();

    expect(await setProductAvailable(b.id, id, false)).toBe(false);
    expect(await setProductAvailable(a.id, id, false)).toBe(true);
    expect(await setProductArchived(a.id, id, true)).toBe(true);
    expect(await listProducts(a.id)).toEqual([]);
    expect((await listProducts(a.id, { archived: true })).map((p) => p.name)).toEqual([
      "Reina",
    ]);
  });

  it("se listan por categoría y nombre, con búsqueda y filtro", async () => {
    const arepas = await categoryId(a.id, "Arepas");
    const dulces = await categoryId(a.id, "Dulces");
    for (const [name, category] of [
      ["Pabellón", arepas],
      ["Catira", arepas],
      ["Quesillo", dulces],
    ] as const) {
      await createProduct(a.id, { categoryId: category, name, description: null, price: "1000" });
    }
    // Dulces va primero en el orden de categorías.
    expect((await listProducts(a.id)).map((p) => p.name)).toEqual([
      "Quesillo",
      "Catira",
      "Pabellón",
    ]);
    expect((await listProducts(a.id, { search: "CAT" })).map((p) => p.name)).toEqual(["Catira"]);
    expect(
      (await listProducts(a.id, { categoryId: arepas })).map((p) => p.name),
    ).toEqual(["Catira", "Pabellón"]);
    expect(await listProducts(b.id)).toEqual([]);
  });

  it("una categoría solo se borra si nunca tuvo productos", async () => {
    // Bebidas solo tiene un producto archivado: igual no se puede borrar.
    const bebidas = await categoryId(a.id, "Bebidas");
    expect(await deleteProductCategory(a.id, bebidas)).toBe(false);

    expect(await createProductCategory(a.id, "Temporal")).toBe("OK");
    const temporal = await categoryId(a.id, "Temporal");
    expect(await deleteProductCategory(b.id, temporal)).toBe(false);
    expect(await deleteProductCategory(a.id, temporal)).toBe(true);

    const counts = Object.fromEntries(
      (await listProductCategories(a.id)).map((c) => [c.name, c._count.products]),
    );
    expect(counts).toEqual({ Dulces: 1, Arepas: 2, Bebidas: 1 });
  });
});
