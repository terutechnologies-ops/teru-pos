import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { PRODUCT_EVENTS } from "@/server/services/auth/config";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createCatalogProduct,
  createCategory,
  getCategories,
  getProductCatalog,
  getProductForm,
  setCatalogProductArchived,
  setCatalogProductAvailable,
  setCategoryActive,
  updateCatalogProduct,
} from "@/server/services/catalog";

import { cleanupCompanies, createCompany, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("products");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let arepas: string;
let bebidas: string;
let ajena: string;

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: Company, role: StaffRole, userId = "u"): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const owner = () => sessionFor(a, "OWNER", "owner-a");

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await db.company.update({ where: { id: b.id }, data: { currency: "USD" } });
  await createCategory(owner(), "Arepas");
  await createCategory(owner(), "Bebidas");
  await createCategory(sessionFor(b, "OWNER"), "Ajena");
  const ids = async (company: Company) =>
    Object.fromEntries(
      (await getCategories(sessionFor(company, "OWNER"))).map((c) => [c.name, c.id]),
    );
  ({ Arepas: arepas, Bebidas: bebidas } = await ids(a));
  ({ Ajena: ajena } = await ids(b));
});
afterAll(() => cleanupCompanies(tag));

const events = (productId: string) =>
  db.authAuditLog.findMany({
    where: { targetType: "PRODUCT", targetId: productId },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorId: true, companyId: true },
  });

describe("productos (servicio)", () => {
  let productId: string;

  it("crea con precio según la moneda y audita con el producto", async () => {
    const input = { name: "Reina Pepiada", categoryId: arepas, description: "", price: "16500" };
    const created = await createCatalogProduct(owner(), input, ctx(tag));
    expect(created).toMatchObject({ ok: true });
    productId = (created as { productId: string }).productId;

    expect(await events(productId)).toEqual([
      { action: PRODUCT_EVENTS.CREATED, actorId: "owner-a", companyId: a.id },
    ]);

    // COP no usa centavos; nombre repetido; categoría ajena.
    expect(await createCatalogProduct(owner(), { ...input, name: "Otra", price: "4,5" }, ctx(tag)))
      .toEqual({ ok: false, fieldErrors: { price: "Esta moneda no usa centavos." } });
    expect(await createCatalogProduct(owner(), { ...input, name: "reina pepiada" }, ctx(tag)))
      .toEqual({ ok: false, fieldErrors: { name: "Ya existe un producto con ese nombre." } });
    expect(
      await createCatalogProduct(owner(), { ...input, name: "Otra", categoryId: ajena }, ctx(tag)),
    ).toEqual({ ok: false, fieldErrors: { categoryId: "Elige una categoría válida." } });

    // USD sí admite centavos (empresa B).
    expect(
      await createCatalogProduct(
        sessionFor(b, "ADMIN"),
        { name: "Soda", categoryId: ajena, description: "", price: "2,5" },
        ctx(tag),
      ),
    ).toMatchObject({ ok: true });
    const { products } = await getProductCatalog(sessionFor(b, "OWNER"), {});
    expect(products.map((p) => [p.name, p.price])).toEqual([["Soda", "2.5"]]);
  });

  it("edita, audita cambios y el cambio de precio aparte", async () => {
    const base = { name: "Reina Pepiada", categoryId: arepas, description: "", price: "16500" };
    // Sin cambios: no audita.
    expect(await updateCatalogProduct(owner(), productId, base, ctx(tag))).toEqual({
      ok: true,
      productId,
    });
    expect(await events(productId)).toHaveLength(1);

    await updateCatalogProduct(owner(), productId, { ...base, description: "Con aguacate" }, ctx(tag));
    await updateCatalogProduct(owner(), productId, { ...base, description: "Con aguacate", price: "17000" }, ctx(tag));
    expect((await events(productId)).map((e) => e.action)).toEqual([
      PRODUCT_EVENTS.CREATED,
      PRODUCT_EVENTS.UPDATED,
      PRODUCT_EVENTS.UPDATED,
      PRODUCT_EVENTS.PRICE_CHANGED,
    ]);

    // Otra empresa no lo encuentra.
    expect(await updateCatalogProduct(sessionFor(b, "OWNER"), productId, base, ctx(tag)))
      .toMatchObject({ ok: false, error: expect.any(String) });
    expect(await getProductForm(sessionFor(b, "OWNER"), productId)).toBeNull();
  });

  it("no permite pasar a una categoría inactiva, salvo si ya estaba en ella", async () => {
    await setCategoryActive(owner(), bebidas, false);
    const input = { name: "Reina Pepiada", categoryId: bebidas, description: "Con aguacate", price: "17000" };
    const inactive = { ok: false, fieldErrors: { categoryId: expect.any(String) } };
    expect(await updateCatalogProduct(owner(), productId, input, ctx(tag))).toEqual(inactive);
    expect(
      await createCatalogProduct(owner(), { ...input, name: "Nueva" }, ctx(tag)),
    ).toEqual(inactive);

    // Un producto que ya está en una categoría inactiva se puede seguir editando.
    await setCategoryActive(owner(), bebidas, true);
    await updateCatalogProduct(owner(), productId, input, ctx(tag));
    await setCategoryActive(owner(), bebidas, false);
    expect(
      await updateCatalogProduct(owner(), productId, { ...input, price: "18000" }, ctx(tag)),
    ).toMatchObject({ ok: true });

    const form = await getProductForm(owner(), productId);
    expect(form?.categories.map((c) => [c.name, c.isActive])).toEqual([
      ["Arepas", true],
      ["Bebidas", false],
    ]);
    const newForm = await getProductForm(owner());
    expect(newForm?.categories.map((c) => c.name)).toEqual(["Arepas"]);
    await setCategoryActive(owner(), bebidas, true);
  });

  it("marca agotado y archiva (sin repetir eventos)", async () => {
    const before = (await events(productId)).length;
    expect(await setCatalogProductAvailable(owner(), productId, false, ctx(tag))).toEqual({ ok: true });
    expect(await setCatalogProductAvailable(owner(), productId, false, ctx(tag))).toEqual({ ok: true });
    expect(await setCatalogProductArchived(owner(), productId, true, ctx(tag))).toEqual({ ok: true });

    expect((await getProductCatalog(owner(), {})).products).toEqual([]);
    const archived = await getProductCatalog(owner(), { archived: true });
    expect(archived.products).toMatchObject([
      { id: productId, isArchived: true, isAvailable: false, price: "18000" },
    ]);

    expect(await setCatalogProductArchived(owner(), productId, false, ctx(tag))).toEqual({ ok: true });
    expect((await events(productId)).slice(before).map((e) => e.action)).toEqual([
      PRODUCT_EVENTS.AVAILABILITY_CHANGED,
      PRODUCT_EVENTS.ARCHIVED,
      PRODUCT_EVENTS.RESTORED,
    ]);
    expect(
      await setCatalogProductArchived(sessionFor(b, "OWNER"), productId, true, ctx(tag)),
    ).toMatchObject({ ok: false });
  });

  it("busca y filtra", async () => {
    await createCatalogProduct(owner(), { name: "Limonada", categoryId: bebidas, description: "", price: "5000" }, ctx(tag));
    const names = async (filters: Parameters<typeof getProductCatalog>[1]) =>
      (await getProductCatalog(owner(), filters)).products.map((p) => p.name);
    // Reina Pepiada quedó en Bebidas (prueba anterior): ambas en la misma
    // categoría, en orden alfabético.
    expect(await names({})).toEqual(["Limonada", "Reina Pepiada"]);
    expect(await names({ search: "limo" })).toEqual(["Limonada"]);
    expect(await names({ categoryId: bebidas })).toEqual(["Limonada", "Reina Pepiada"]);
    expect(await names({ categoryId: arepas })).toEqual([]);
  });

  it("el personal no gestiona productos", async () => {
    const staff = sessionFor(a, "STAFF");
    const input = { name: "X Y", categoryId: arepas, description: "", price: "1" };
    await expect(getProductCatalog(staff, {})).rejects.toThrow(ForbiddenError);
    await expect(getProductForm(staff)).rejects.toThrow(ForbiddenError);
    await expect(createCatalogProduct(staff, input, ctx(tag))).rejects.toThrow(ForbiddenError);
    await expect(updateCatalogProduct(staff, productId, input, ctx(tag))).rejects.toThrow(ForbiddenError);
    await expect(setCatalogProductArchived(staff, productId, true, ctx(tag))).rejects.toThrow(ForbiddenError);
    await expect(setCatalogProductAvailable(staff, productId, true, ctx(tag))).rejects.toThrow(ForbiddenError);
  });
});
