import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createCategory,
  deleteCategory,
  getCategories,
  moveCategory,
  renameCategory,
  setCategoryActive,
} from "@/server/services/catalog";

import { cleanupCompanies, createCompany, uniqueTag } from "../helpers";

const tag = uniqueTag("categories");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => cleanupCompanies(tag));

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const idOf = async (company: Company, name: string) =>
  (await getCategories(sessionFor(company, "OWNER"))).find((c) => c.name === name)!.id;

describe("categorías (servicio)", () => {
  it("el administrador crea, renombra, ordena y desactiva", async () => {
    const admin = sessionFor(a, "ADMIN");
    expect(await createCategory(admin, "  Arepas ")).toEqual({ ok: true });
    expect(await createCategory(admin, "Bebidas")).toEqual({ ok: true });
    expect(await createCategory(admin, "bebidas")).toEqual({
      ok: false,
      error: "Ya existe una categoría con ese nombre.",
    });
    expect(await createCategory(admin, "B")).toMatchObject({ ok: false });

    const bebidas = await idOf(a, "Bebidas");
    expect(await renameCategory(admin, bebidas, "Bebidas  frías")).toEqual({ ok: true });
    expect(await renameCategory(admin, bebidas, "")).toMatchObject({ ok: false });
    expect(await moveCategory(admin, bebidas, "up")).toEqual({ ok: true });
    expect(await moveCategory(admin, bebidas, "up")).toMatchObject({ ok: false });
    expect(await setCategoryActive(admin, bebidas, false)).toEqual({ ok: true });

    expect(await getCategories(admin)).toMatchObject([
      { name: "Bebidas frías", isActive: false, productCount: 0, canDelete: true },
      { name: "Arepas", isActive: true },
    ]);
  });

  it("no toca categorías de otra empresa", async () => {
    const bebidas = await idOf(a, "Bebidas frías");
    const other = sessionFor(b, "OWNER");
    expect(await renameCategory(other, bebidas, "Robada")).toMatchObject({ ok: false });
    expect(await setCategoryActive(other, bebidas, true)).toMatchObject({ ok: false });
    expect(await moveCategory(other, bebidas, "down")).toMatchObject({ ok: false });
    expect(await deleteCategory(other, bebidas)).toMatchObject({ ok: false });
    expect(await getCategories(other)).toEqual([]);
    expect(await idOf(a, "Bebidas frías")).toBe(bebidas);
  });

  it("solo elimina categorías que nunca tuvieron productos", async () => {
    const owner = sessionFor(a, "OWNER");
    const arepas = await idOf(a, "Arepas");
    await db.product.create({
      data: { companyId: a.id, categoryId: arepas, name: "Catira", price: 1000, isArchived: true },
    });
    const withProduct = (await getCategories(owner)).find((c) => c.id === arepas);
    expect(withProduct).toMatchObject({ productCount: 1, canDelete: false });
    expect(await deleteCategory(owner, arepas)).toEqual({
      ok: false,
      error: "Esta categoría tiene productos: desactívala en lugar de eliminarla.",
    });

    const bebidas = await idOf(a, "Bebidas frías");
    expect(await deleteCategory(owner, bebidas)).toEqual({ ok: true });
    expect((await getCategories(owner)).map((c) => c.name)).toEqual(["Arepas"]);
  });

  it("el personal no gestiona el catálogo", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(getCategories(staff)).rejects.toThrow(ForbiddenError);
    await expect(createCategory(staff, "Nueva")).rejects.toThrow(ForbiddenError);
    await expect(renameCategory(staff, "id", "Nueva")).rejects.toThrow(ForbiddenError);
    await expect(setCategoryActive(staff, "id", false)).rejects.toThrow(ForbiddenError);
    await expect(moveCategory(staff, "id", "up")).rejects.toThrow(ForbiddenError);
    await expect(deleteCategory(staff, "id")).rejects.toThrow(ForbiddenError);
  });
});
