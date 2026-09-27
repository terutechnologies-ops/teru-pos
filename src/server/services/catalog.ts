import "server-only";

import type { StaffSessionDto } from "@/server/dto/auth";
import {
  createProductCategory,
  deleteProductCategory,
  listProductCategories,
  moveProductCategory,
  renameProductCategory,
  setProductCategoryActive,
  type CatalogWriteStatus,
} from "@/server/data/catalog";
import { assertPermission } from "@/server/services/auth/permissions";
import { categoryNameSchema } from "@/server/validations/catalog";

// Catálogo de venta. Todo con catalog.manage y dentro de la empresa de la
// sesión. Las categorías no se auditan (bajo impacto; decisión aprobada).

export type CatalogResult = { ok: true } | { ok: false; error: string };

const CATEGORY_GONE = "La categoría ya no existe. Actualiza la página.";

const WRITE_ERRORS: Record<Exclude<CatalogWriteStatus, "OK">, string> = {
  NOT_FOUND: CATEGORY_GONE,
  NAME_TAKEN: "Ya existe una categoría con ese nombre.",
  CATEGORY_NOT_FOUND: CATEGORY_GONE,
};

function fromStatus(status: CatalogWriteStatus): CatalogResult {
  return status === "OK" ? { ok: true } : { ok: false, error: WRITE_ERRORS[status] };
}

function parseName(input: unknown) {
  const parsed = categoryNameSchema.safeParse(input);
  return parsed.success
    ? { ok: true as const, name: parsed.data }
    : { ok: false as const, error: parsed.error.issues[0].message };
}

export async function getCategories(session: StaffSessionDto) {
  assertPermission(session, "catalog.manage");
  const categories = await listProductCategories(session.company.id);
  return categories.map(({ _count, ...category }) => ({
    ...category,
    productCount: _count.products,
    // Borrar solo si nunca tuvo productos (ni archivados).
    canDelete: _count.products === 0,
  }));
}

export type CategoryOverview = Awaited<ReturnType<typeof getCategories>>[number];

export async function createCategory(
  session: StaffSessionDto,
  name: unknown,
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const parsed = parseName(name);
  if (!parsed.ok) return parsed;
  return fromStatus(await createProductCategory(session.company.id, parsed.name));
}

export async function renameCategory(
  session: StaffSessionDto,
  categoryId: string,
  name: unknown,
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const parsed = parseName(name);
  if (!parsed.ok) return parsed;
  return fromStatus(
    await renameProductCategory(session.company.id, categoryId, parsed.name),
  );
}

export async function setCategoryActive(
  session: StaffSessionDto,
  categoryId: string,
  isActive: boolean,
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const changed = await setProductCategoryActive(session.company.id, categoryId, isActive);
  return changed ? { ok: true } : { ok: false, error: CATEGORY_GONE };
}

export async function moveCategory(
  session: StaffSessionDto,
  categoryId: string,
  direction: "up" | "down",
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const moved = await moveProductCategory(session.company.id, categoryId, direction);
  return moved
    ? { ok: true }
    : { ok: false, error: "No se pudo mover la categoría. Actualiza la página." };
}

export async function deleteCategory(
  session: StaffSessionDto,
  categoryId: string,
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const deleted = await deleteProductCategory(session.company.id, categoryId);
  return deleted
    ? { ok: true }
    : {
        ok: false,
        error: "Esta categoría tiene productos: desactívala en lugar de eliminarla.",
      };
}
