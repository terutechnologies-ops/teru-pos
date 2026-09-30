"use server";

import { refresh } from "next/cache";

import type { RowActionState } from "@/components/shared/row-action-button";
import { getRequestContext, requirePermission } from "@/server/http/staff-session";
import {
  addProductRecipeItem,
  removeProductRecipeItem,
  updateProductRecipeItem,
  type RecipeResult,
} from "@/server/services/recipes";

import { readRecipeForm, type RecipeFormState } from "./recipe-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "catalog.manage");
}

async function saveLine(
  formData: FormData,
  label: string,
  save: (
    session: Awaited<ReturnType<typeof sessionFrom>>,
    values: ReturnType<typeof readRecipeForm>,
  ) => Promise<RecipeResult>,
): Promise<RecipeFormState> {
  const session = await sessionFrom(formData);
  const values = readRecipeForm(formData);
  let result: RecipeResult;
  try {
    result = await save(session, values);
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, values };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: result.error ?? null,
      fieldErrors: result.fieldErrors,
      values,
    };
  }
  refresh();
  return { status: "saved", message: null, fieldErrors: {}, values };
}

export async function addRecipeItemAction(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  return saveLine(formData, "addRecipeItemAction", async (session, values) =>
    addProductRecipeItem(session, field(formData, "productId"), values, await getRequestContext()),
  );
}

export async function updateRecipeItemAction(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  return saveLine(formData, "updateRecipeItemAction", async (session, values) =>
    updateProductRecipeItem(session, field(formData, "id"), values, await getRequestContext()),
  );
}

// Botón de cada línea: quitar el insumo de la receta.
export async function recipeRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const id = field(formData, "id");
  if (field(formData, "intent") !== "remove" || !id) return { error: UNEXPECTED };

  let result: RecipeResult;
  try {
    result = await removeProductRecipeItem(session, id, await getRequestContext());
  } catch (error) {
    console.error("recipeRowAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED };
  }
  refresh();
  return { error: result.ok ? null : (result.error ?? UNEXPECTED) };
}
