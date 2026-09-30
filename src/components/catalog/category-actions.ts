"use server";

import { refresh } from "next/cache";

import type { NameFormState } from "@/components/shared/rename-form";
import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  setCategoryActive,
  type CatalogResult,
} from "@/server/services/catalog";

import { CATEGORY_INTENTS, type CategoryIntent } from "./category-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "catalog.manage");
}

async function attempt(label: string, run: () => Promise<CatalogResult>) {
  try {
    return await run();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { ok: false as const, error: UNEXPECTED };
  }
}

export async function createCategoryAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const result = await attempt("createCategoryAction", () => createCategory(session, name));
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name: "" };
}

export async function renameCategoryAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const result = await attempt("renameCategoryAction", () =>
    renameCategory(session, field(formData, "id"), name),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name };
}

function isIntent(value: string): value is CategoryIntent {
  return (CATEGORY_INTENTS as readonly string[]).includes(value);
}

// Botones de cada fila: mover, activar/desactivar y eliminar.
export async function categoryRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if (!isIntent(intent) || !id) return { error: UNEXPECTED };

  const result = await attempt("categoryRowAction", () => {
    switch (intent) {
      case "up":
      case "down":
        return moveCategory(session, id, intent);
      case "activate":
      case "deactivate":
        return setCategoryActive(session, id, intent === "activate");
      case "delete":
        return deleteCategory(session, id);
    }
  });
  refresh();
  return { error: result.ok ? null : result.error };
}
