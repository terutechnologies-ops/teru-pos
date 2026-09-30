import "server-only";

import { z } from "zod";

import type { StockUnit } from "@/generated/prisma/enums";
import { familyUnits, UNIT_INFO } from "@/lib/units";
import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { findProduct } from "@/server/data/catalog";
import { findSupply, listSupplies } from "@/server/data/inventory";
import {
  addRecipeItem,
  findRecipeItem,
  listRecipeItems,
  removeRecipeItem,
  updateRecipeItem,
} from "@/server/data/recipes";
import { PRODUCT_EVENTS } from "@/server/services/auth/config";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import { auditProduct } from "@/server/services/catalog";
import {
  recipeItemSchema,
  recipeLineSchema,
  type RecipeItemInput,
  type RecipeLineInput,
} from "@/server/validations/recipes";

// Recetas de los productos. Todo con catalog.manage y dentro de la empresa
// de la sesión. Cada cambio se audita sobre el producto (afecta su costo).

export type RecipeField = keyof RecipeItemInput;

export type RecipeResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<RecipeField, string>>; error?: string };

const PRODUCT_GONE = "El producto ya no existe. Actualiza la página.";
const LINE_GONE = "Este insumo ya no está en la receta. Actualiza la página.";

function fail(error: string): RecipeResult {
  return { ok: false, fieldErrors: {}, error };
}

function fieldError(field: RecipeField, message: string): RecipeResult {
  return { ok: false, fieldErrors: { [field]: message } };
}

// "El insumo se mide en kg: usa g o kg."
function unitMismatch(supplyUnit: StockUnit | undefined): RecipeResult {
  if (!supplyUnit) return fieldError("unit", "La unidad no corresponde al insumo.");
  const options = familyUnits(supplyUnit).map((unit) => UNIT_INFO[unit].symbol);
  return fieldError(
    "unit",
    `El insumo se mide en ${UNIT_INFO[supplyUnit].symbol}: usa ${options.join(" o ")}.`,
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    ok: false as const,
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, errors]) => [field, (errors as string[])?.[0]]),
    ) as Partial<Record<RecipeField, string>>,
  };
}

// Receta del producto, insumos que se pueden agregar (activos y que aún no
// están) y si la empresa tiene insumos. Cantidades como texto.
export async function getProductRecipe(session: StaffSessionDto, productId: string) {
  assertPermission(session, "catalog.manage");
  const companyId = session.company.id;
  const [product, items, supplies] = await Promise.all([
    findProduct(companyId, productId),
    listRecipeItems(companyId, productId),
    listSupplies(companyId),
  ]);
  if (!product) return null;

  const used = new Set(items.map((item) => item.supply.id));
  return {
    product: {
      id: product.id,
      name: product.name,
      isArchived: product.isArchived,
      isAvailable: product.isAvailable,
    },
    items: items.map((item) => ({
      id: item.id,
      quantity: item.quantity.toString(),
      unit: item.unit,
      supply: {
        id: item.supply.id,
        name: item.supply.name,
        unit: item.supply.unit,
        isArchived: item.supply.isArchived,
      },
    })),
    supplyOptions: supplies
      .filter((supply) => !used.has(supply.id))
      .map(({ id, name, unit }) => ({ id, name, unit })),
    hasSupplies: supplies.length > 0 || items.length > 0,
    // El enlace a la ficha del insumo solo sirve con acceso al inventario.
    canViewSupplies: hasPermission(session.user.role, "inventory.manage"),
  };
}

export type ProductRecipe = NonNullable<Awaited<ReturnType<typeof getProductRecipe>>>;

export async function addProductRecipeItem(
  session: StaffSessionDto,
  productId: string,
  input: RecipeItemInput,
  ctx: RequestContext,
): Promise<RecipeResult> {
  assertPermission(session, "catalog.manage");
  const parsed = parse(recipeItemSchema, input);
  if (!parsed.ok) return parsed;
  const { supplyId, quantity, unit } = parsed.data;
  const companyId = session.company.id;

  const status = await addRecipeItem(companyId, productId, supplyId, { quantity, unit });
  switch (status) {
    case "OK":
      await auditProduct(session, PRODUCT_EVENTS.RECIPE_CHANGED, productId, ctx);
      return { ok: true };
    case "PRODUCT_NOT_FOUND":
      return fail(PRODUCT_GONE);
    case "SUPPLY_NOT_FOUND":
      return fieldError("supplyId", "El insumo ya no existe. Actualiza la página.");
    case "SUPPLY_ARCHIVED":
      return fieldError("supplyId", "El insumo está archivado: restáuralo para usarlo en recetas.");
    case "ALREADY_IN_RECIPE":
      return fieldError("supplyId", "Este insumo ya está en la receta: cambia su cantidad en la lista.");
    case "UNIT_MISMATCH":
      return unitMismatch((await findSupply(companyId, supplyId))?.unit);
    default:
      return fail(LINE_GONE);
  }
}

export async function updateProductRecipeItem(
  session: StaffSessionDto,
  itemId: string,
  input: RecipeLineInput,
  ctx: RequestContext,
): Promise<RecipeResult> {
  assertPermission(session, "catalog.manage");
  const parsed = parse(recipeLineSchema, input);
  if (!parsed.ok) return parsed;
  const companyId = session.company.id;
  const item = await findRecipeItem(companyId, itemId);
  if (!item) return fail(LINE_GONE);

  const status = await updateRecipeItem(companyId, itemId, parsed.data);
  if (status === "UNIT_MISMATCH") return unitMismatch(item.supply.unit);
  if (status !== "OK") return fail(LINE_GONE);
  await auditProduct(session, PRODUCT_EVENTS.RECIPE_CHANGED, item.productId, ctx);
  return { ok: true };
}

export async function removeProductRecipeItem(
  session: StaffSessionDto,
  itemId: string,
  ctx: RequestContext,
): Promise<RecipeResult> {
  assertPermission(session, "catalog.manage");
  const companyId = session.company.id;
  const item = await findRecipeItem(companyId, itemId);
  if (!item) return fail(LINE_GONE);
  if ((await removeRecipeItem(companyId, itemId)) !== "OK") return fail(LINE_GONE);
  await auditProduct(session, PRODUCT_EVENTS.RECIPE_CHANGED, item.productId, ctx);
  return { ok: true };
}
