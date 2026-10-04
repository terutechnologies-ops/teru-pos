import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Categorías de gasto de cada empresa (ver ADR 0010). El orden es el que
// ve el cajero al registrar un gasto. Siempre queda al menos una activa:
// sin ninguna no se podrían registrar gastos.

export type ExpenseCategoryWriteStatus =
  | "OK"
  | "NOT_FOUND"
  | "NAME_TAKEN"
  // Tiene gastos: no se elimina (se desactiva).
  | "IN_USE"
  // Es la única activa.
  | "LAST_ACTIVE";

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

// Bloquea todas las categorías de la empresa: desactivar o eliminar dos a
// la vez no deja la empresa sin ninguna activa.
async function lockCategories(tx: Prisma.TransactionClient, companyId: string) {
  return tx.$queryRaw<{ id: string; isActive: boolean }[]>`
    SELECT "id", "isActive" FROM "expense_categories"
    WHERE "companyId" = ${companyId}
    ORDER BY "id"
    FOR UPDATE`;
}

const isLastActive = (categories: { id: string; isActive: boolean }[], categoryId: string) =>
  categories.every((category) => category.id === categoryId || !category.isActive);

export async function listExpenseCategories(
  companyId: string,
  filters: { activeOnly?: boolean } = {},
) {
  return db.expenseCategory.findMany({
    where: { companyId, ...(filters.activeOnly && { isActive: true }) },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      _count: { select: { movements: true } },
    },
  });
}

// Se agrega al final del orden.
export async function createExpenseCategory(
  companyId: string,
  name: string,
): Promise<ExpenseCategoryWriteStatus> {
  try {
    await db.$transaction(async (tx) => {
      const last = await tx.expenseCategory.aggregate({
        where: { companyId },
        _max: { position: true },
      });
      await tx.expenseCategory.create({
        data: { companyId, name, position: (last._max.position ?? 0) + 1 },
      });
    });
    return "OK";
  } catch (error) {
    // Índice único sobre lower(name).
    if (prismaCode(error) === "P2002") return "NAME_TAKEN";
    throw error;
  }
}

export async function renameExpenseCategory(
  companyId: string,
  categoryId: string,
  name: string,
): Promise<ExpenseCategoryWriteStatus> {
  try {
    const { count } = await db.expenseCategory.updateMany({
      where: { id: categoryId, companyId },
      data: { name },
    });
    return count === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    if (prismaCode(error) === "P2002") return "NAME_TAKEN";
    throw error;
  }
}

export async function setExpenseCategoryActive(
  companyId: string,
  categoryId: string,
  isActive: boolean,
): Promise<ExpenseCategoryWriteStatus> {
  return db.$transaction(async (tx) => {
    const categories = await lockCategories(tx, companyId);
    if (!categories.some((category) => category.id === categoryId)) return "NOT_FOUND";
    if (!isActive && isLastActive(categories, categoryId)) return "LAST_ACTIVE";
    await tx.expenseCategory.update({ where: { id: categoryId }, data: { isActive } });
    return "OK";
  });
}

// Solo si nunca se usó (la FK lo garantiza aunque un gasto entre a la vez).
export async function deleteExpenseCategory(
  companyId: string,
  categoryId: string,
): Promise<ExpenseCategoryWriteStatus> {
  try {
    return await db.$transaction(async (tx) => {
      const categories = await lockCategories(tx, companyId);
      if (!categories.some((category) => category.id === categoryId)) return "NOT_FOUND";
      const used = await tx.cashMovement.count({ where: { companyId, categoryId } });
      if (used > 0) return "IN_USE";
      if (isLastActive(categories, categoryId)) return "LAST_ACTIVE";
      await tx.expenseCategory.delete({ where: { id: categoryId } });
      return "OK";
    });
  } catch (error) {
    if (prismaCode(error) === "P2003") return "IN_USE";
    throw error;
  }
}

// Sube o baja una posición, renumerando todas (1..n) como los métodos de
// pago. false si no existe o ya está en el extremo.
export async function moveExpenseCategory(
  companyId: string,
  categoryId: string,
  direction: "up" | "down",
) {
  return db.$transaction(async (tx) => {
    const ordered = await tx.expenseCategory.findMany({
      where: { companyId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const index = ordered.findIndex((category) => category.id === categoryId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= ordered.length) return false;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    // Una sola consulta: una por categoría se acerca al límite de la
    // transacción con la latencia a Supabase.
    await tx.$executeRaw`
      UPDATE "expense_categories" AS e SET "position" = v."position"
      FROM unnest(
        ${ordered.map((category) => category.id)}::text[],
        ${ordered.map((_, offset) => offset + 1)}::int[]
      ) AS v("id", "position")
      WHERE e."id" = v."id" AND e."companyId" = ${companyId}`;
    return true;
  });
}
