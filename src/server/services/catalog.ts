import "server-only";

import { z } from "zod";

import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import {
  createProduct,
  createProductCategory,
  deleteProductCategory,
  findProduct,
  findProductCategory,
  listProductCategories,
  listProducts,
  moveProductCategory,
  renameProductCategory,
  setProductArchived,
  setProductAvailable,
  setProductCategoryActive,
  updateProduct,
  type CatalogWriteStatus,
} from "@/server/data/catalog";
import { findCompanySettings } from "@/server/data/companies";
import { PRODUCT_EVENTS } from "@/server/services/auth/config";
import { assertPermission } from "@/server/services/auth/permissions";
import {
  categoryNameSchema,
  productSchema,
  type ProductInput,
} from "@/server/validations/catalog";

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

// --- Productos --------------------------------------------------------------

async function companyCurrency(companyId: string) {
  const company = await findCompanySettings(companyId);
  if (!company) throw new Error("Empresa no encontrada");
  return company.currency;
}

function auditProduct(
  session: StaffSessionDto,
  action: string,
  productId: string,
  ctx: RequestContext,
) {
  return recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    target: { type: "PRODUCT", id: productId },
  });
}

// Precio como texto (Decimal serializado): la vista lo formatea con la
// moneda de la empresa.
function toProductDto(product: NonNullable<Awaited<ReturnType<typeof findProduct>>>) {
  return { ...product, price: product.price.toString() };
}

export type ProductDto = ReturnType<typeof toProductDto>;

export async function getProductCatalog(
  session: StaffSessionDto,
  filters: { search?: string; categoryId?: string; archived?: boolean },
) {
  assertPermission(session, "catalog.manage");
  const companyId = session.company.id;
  const [currency, categories, products] = await Promise.all([
    companyCurrency(companyId),
    listProductCategories(companyId),
    listProducts(companyId, {
      search: filters.search?.trim() || undefined,
      categoryId: filters.categoryId || undefined,
      archived: filters.archived,
    }),
  ]);
  return {
    currency,
    categories: categories.map(({ id, name, isActive }) => ({ id, name, isActive })),
    products: products.map(toProductDto),
  };
}

// Datos del formulario: categorías activas (más la actual del producto si
// está inactiva, para no perderla al editar).
export async function getProductForm(session: StaffSessionDto, productId?: string) {
  assertPermission(session, "catalog.manage");
  const companyId = session.company.id;
  const [currency, categories, product] = await Promise.all([
    companyCurrency(companyId),
    listProductCategories(companyId),
    productId ? findProduct(companyId, productId) : null,
  ]);
  if (productId && !product) return null;
  return {
    currency,
    categories: categories
      .filter((c) => c.isActive || c.id === product?.category.id)
      .map(({ id, name, isActive }) => ({ id, name, isActive })),
    product: product ? toProductDto(product) : null,
  };
}

export type ProductField = keyof ProductInput;

export type SaveProductResult =
  | { ok: true; productId: string }
  | { ok: false; fieldErrors: Partial<Record<ProductField, string>>; error?: string };

const PRODUCT_GONE = "El producto ya no existe. Actualiza la página.";

async function parseProduct(companyId: string, input: ProductInput) {
  const parsed = productSchema(await companyCurrency(companyId)).safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    ok: false as const,
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
    ) as Partial<Record<ProductField, string>>,
  };
}

function statusError(status: Exclude<CatalogWriteStatus, "OK">): SaveProductResult {
  switch (status) {
    case "NAME_TAKEN":
      return { ok: false, fieldErrors: { name: "Ya existe un producto con ese nombre." } };
    case "CATEGORY_NOT_FOUND":
      return { ok: false, fieldErrors: { categoryId: "Elige una categoría válida." } };
    case "NOT_FOUND":
      return { ok: false, fieldErrors: {}, error: PRODUCT_GONE };
  }
}

const INACTIVE_CATEGORY: SaveProductResult = {
  ok: false,
  fieldErrors: { categoryId: "Esa categoría está inactiva. Actívala o elige otra." },
};

export async function createCatalogProduct(
  session: StaffSessionDto,
  input: ProductInput,
  ctx: RequestContext,
): Promise<SaveProductResult> {
  assertPermission(session, "catalog.manage");
  const companyId = session.company.id;
  const parsed = await parseProduct(companyId, input);
  if (!parsed.ok) return parsed;

  const category = await findProductCategory(companyId, parsed.data.categoryId);
  if (category && !category.isActive) return INACTIVE_CATEGORY;

  const { status, id } = await createProduct(companyId, parsed.data);
  if (status !== "OK") return statusError(status);
  if (!id) throw new Error("createProduct no devolvió el id");
  await auditProduct(session, PRODUCT_EVENTS.CREATED, id, ctx);
  return { ok: true, productId: id };
}

export async function updateCatalogProduct(
  session: StaffSessionDto,
  productId: string,
  input: ProductInput,
  ctx: RequestContext,
): Promise<SaveProductResult> {
  assertPermission(session, "catalog.manage");
  const companyId = session.company.id;
  const current = await findProduct(companyId, productId);
  if (!current) return { ok: false, fieldErrors: {}, error: PRODUCT_GONE };
  const parsed = await parseProduct(companyId, input);
  if (!parsed.ok) return parsed;
  const data = parsed.data;

  // Una categoría inactiva solo vale si el producto ya estaba en ella.
  if (data.categoryId !== current.category.id) {
    const category = await findProductCategory(companyId, data.categoryId);
    if (category && !category.isActive) return INACTIVE_CATEGORY;
  }

  const priceChanged = !current.price.equals(data.price);
  const changed =
    priceChanged ||
    data.name !== current.name ||
    data.categoryId !== current.category.id ||
    data.description !== current.description;
  if (!changed) return { ok: true, productId };

  const status = await updateProduct(companyId, productId, data);
  if (status !== "OK") return statusError(status);
  await auditProduct(session, PRODUCT_EVENTS.UPDATED, productId, ctx);
  if (priceChanged) await auditProduct(session, PRODUCT_EVENTS.PRICE_CHANGED, productId, ctx);
  return { ok: true, productId };
}

export async function setCatalogProductArchived(
  session: StaffSessionDto,
  productId: string,
  archived: boolean,
  ctx: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const current = await findProduct(session.company.id, productId);
  if (!current) return { ok: false, error: PRODUCT_GONE };
  if (current.isArchived === archived) return { ok: true };
  await setProductArchived(session.company.id, productId, archived);
  await auditProduct(
    session,
    archived ? PRODUCT_EVENTS.ARCHIVED : PRODUCT_EVENTS.RESTORED,
    productId,
    ctx,
  );
  return { ok: true };
}

export async function setCatalogProductAvailable(
  session: StaffSessionDto,
  productId: string,
  available: boolean,
  ctx: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "catalog.manage");
  const current = await findProduct(session.company.id, productId);
  if (!current) return { ok: false, error: PRODUCT_GONE };
  if (current.isAvailable === available) return { ok: true };
  await setProductAvailable(session.company.id, productId, available);
  await auditProduct(session, PRODUCT_EVENTS.AVAILABILITY_CHANGED, productId, ctx);
  return { ok: true };
}
