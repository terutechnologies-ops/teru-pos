"use server";

import { refresh } from "next/cache";

import type { NameFormState } from "@/components/shared/rename-form";
import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  moveExpenseCategory,
  renameExpenseCategory,
  setExpenseCategoryActive,
  type ExpenseCategoryResult,
} from "@/server/services/expense-categories";

import { EXPENSE_CATEGORY_INTENTS, type ExpenseCategoryIntent } from "./expense-category-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "expenses.manage");
}

async function attempt(label: string, run: () => Promise<ExpenseCategoryResult>) {
  try {
    return await run();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { ok: false as const, error: UNEXPECTED };
  }
}

export async function createExpenseCategoryAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const result = await attempt("createExpenseCategoryAction", () =>
    createExpenseCategory(session, name),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name: "" };
}

export async function renameExpenseCategoryAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const result = await attempt("renameExpenseCategoryAction", () =>
    renameExpenseCategory(session, field(formData, "id"), name),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name };
}

function isIntent(value: string): value is ExpenseCategoryIntent {
  return (EXPENSE_CATEGORY_INTENTS as readonly string[]).includes(value);
}

// Botones de cada fila: mover, activar/desactivar y eliminar.
export async function expenseCategoryRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if (!isIntent(intent) || !id) return { error: UNEXPECTED };

  const result = await attempt("expenseCategoryRowAction", () => {
    switch (intent) {
      case "up":
      case "down":
        return moveExpenseCategory(session, id, intent);
      case "activate":
      case "deactivate":
        return setExpenseCategoryActive(session, id, intent === "activate");
      case "delete":
        return deleteExpenseCategory(session, id);
    }
  });
  refresh();
  return { error: result.ok ? null : result.error };
}
