import "server-only";

import type { StaffSessionDto } from "@/server/dto/auth";
import {
  createExpenseCategory as insertExpenseCategory,
  deleteExpenseCategory as removeExpenseCategory,
  listExpenseCategories,
  moveExpenseCategory as reorderExpenseCategory,
  renameExpenseCategory as updateExpenseCategoryName,
  setExpenseCategoryActive as updateExpenseCategoryActive,
  type ExpenseCategoryWriteStatus,
} from "@/server/data/expense-categories";
import { assertPermission } from "@/server/services/auth/permissions";
import { expenseCategoryNameSchema } from "@/server/validations/expenses";

// Categorías de gasto de la empresa, con expenses.manage. Sin auditoría
// (como las categorías de productos): es configuración y no mueve dinero;
// cada gasto guarda quién y cuándo.

export type ExpenseCategoryResult = { ok: true } | { ok: false; error: string };

const WRITE_ERRORS: Record<Exclude<ExpenseCategoryWriteStatus, "OK">, string> = {
  NOT_FOUND: "La categoría ya no existe. Actualiza la página.",
  NAME_TAKEN: "Ya existe una categoría con ese nombre.",
  IN_USE: "La categoría ya tiene gastos: desactívala en lugar de eliminarla.",
  LAST_ACTIVE: "Debe quedar al menos una categoría activa para registrar gastos.",
};

function result(status: ExpenseCategoryWriteStatus): ExpenseCategoryResult {
  return status === "OK" ? { ok: true } : { ok: false, error: WRITE_ERRORS[status] };
}

function parseName(input: unknown) {
  const parsed = expenseCategoryNameSchema.safeParse(input);
  return parsed.success
    ? { ok: true as const, name: parsed.data }
    : { ok: false as const, error: parsed.error.issues[0].message };
}

export async function getExpenseCategories(session: StaffSessionDto) {
  assertPermission(session, "expenses.manage");
  const categories = await listExpenseCategories(session.company.id);
  return categories.map(({ _count, ...category }) => ({
    ...category,
    expenseCount: _count.movements,
    canDelete: _count.movements === 0,
  }));
}

export type ExpenseCategoryOverview = Awaited<ReturnType<typeof getExpenseCategories>>[number];

export async function createExpenseCategory(
  session: StaffSessionDto,
  name: unknown,
): Promise<ExpenseCategoryResult> {
  assertPermission(session, "expenses.manage");
  const parsed = parseName(name);
  if (!parsed.ok) return parsed;
  return result(await insertExpenseCategory(session.company.id, parsed.name));
}

export async function renameExpenseCategory(
  session: StaffSessionDto,
  categoryId: string,
  name: unknown,
): Promise<ExpenseCategoryResult> {
  assertPermission(session, "expenses.manage");
  const parsed = parseName(name);
  if (!parsed.ok) return parsed;
  return result(await updateExpenseCategoryName(session.company.id, categoryId, parsed.name));
}

export async function setExpenseCategoryActive(
  session: StaffSessionDto,
  categoryId: string,
  isActive: boolean,
): Promise<ExpenseCategoryResult> {
  assertPermission(session, "expenses.manage");
  return result(await updateExpenseCategoryActive(session.company.id, categoryId, isActive));
}

export async function deleteExpenseCategory(
  session: StaffSessionDto,
  categoryId: string,
): Promise<ExpenseCategoryResult> {
  assertPermission(session, "expenses.manage");
  return result(await removeExpenseCategory(session.company.id, categoryId));
}

export async function moveExpenseCategory(
  session: StaffSessionDto,
  categoryId: string,
  direction: "up" | "down",
): Promise<ExpenseCategoryResult> {
  assertPermission(session, "expenses.manage");
  const moved = await reorderExpenseCategory(session.company.id, categoryId, direction);
  return moved
    ? { ok: true }
    : { ok: false, error: "No se pudo mover la categoría. Actualiza la página." };
}
