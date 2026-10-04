import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { CashMovementType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { CASH_TX_OPTIONS, lockCashSession } from "@/server/data/cash-sessions";

// Gastos, retiros e ingresos de efectivo en un turno abierto (ver ADR
// 0010). Los registra el dueño del turno; se anulan mientras el turno siga
// abierto, porque el cierre ya guardó el esperado. Los montos entran como
// texto decimal ya validado.

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Domicilios y transporte",
  "Gas y servicios",
  "Aseo",
  "Compras menores",
  "Otros",
] as const;

// Las crea el alta de la empresa (y la migración, para las existentes).
export async function createDefaultExpenseCategories(
  tx: Prisma.TransactionClient,
  companyId: string,
) {
  await tx.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((name, index) => ({
      companyId,
      name,
      position: index + 1,
    })),
  });
}

export type RecordCashMovementResult =
  | { status: "OK"; movementId: string }
  // Turno de otra empresa, de otra persona o inexistente.
  | { status: "SESSION_NOT_FOUND" | "SESSION_CLOSED" }
  | { status: "CATEGORY_NOT_FOUND" | "CATEGORY_INACTIVE" };

// Toma el turno compartido, como una venta: el cierre (FOR UPDATE) espera a
// que termine y ningún movimiento entra después.
export async function recordCashMovement(
  companyId: string,
  input: {
    cashSessionId: string;
    // Quien registra: debe ser el dueño del turno.
    userId: string;
    type: CashMovementType;
    amount: string;
    // Solo en gastos (obligatoria); en retiros e ingresos se ignora.
    categoryId: string | null;
    note: string | null;
  },
): Promise<RecordCashMovementResult> {
  return db.$transaction(async (tx) => {
    const session = await lockCashSession(tx, companyId, input.cashSessionId, "SHARE");
    if (!session || session.userId !== input.userId) return { status: "SESSION_NOT_FOUND" };
    if (session.closedAt) return { status: "SESSION_CLOSED" };

    const isExpense = input.type === "EXPENSE";
    if (isExpense) {
      const category = input.categoryId
        ? await tx.expenseCategory.findFirst({
            where: { id: input.categoryId, companyId },
            select: { isActive: true },
          })
        : null;
      if (!category) return { status: "CATEGORY_NOT_FOUND" };
      if (!category.isActive) return { status: "CATEGORY_INACTIVE" };
    }

    const movement = await tx.cashMovement.create({
      data: {
        companyId,
        cashSessionId: input.cashSessionId,
        type: input.type,
        amount: new Prisma.Decimal(input.amount),
        categoryId: isExpense ? input.categoryId : null,
        note: input.note,
        userId: input.userId,
      },
      select: { id: true },
    });
    return { status: "OK", movementId: movement.id };
  }, CASH_TX_OPTIONS);
}

export type VoidCashMovementResult = {
  status: "OK" | "NOT_FOUND" | "ALREADY_VOIDED" | "SESSION_CLOSED";
};

export async function voidCashMovement(
  companyId: string,
  input: { movementId: string; userId: string; reason: string },
): Promise<VoidCashMovementResult> {
  return db.$transaction(async (tx) => {
    const movement = await tx.cashMovement.findFirst({
      where: { id: input.movementId, companyId },
      select: { cashSessionId: true },
    });
    if (!movement) return { status: "NOT_FOUND" };
    const session = await lockCashSession(tx, companyId, movement.cashSessionId, "SHARE");
    if (!session) return { status: "NOT_FOUND" };
    if (session.closedAt) return { status: "SESSION_CLOSED" };

    // Solo cambia si sigue registrado: dos anulaciones a la vez no pasan.
    const { count } = await tx.cashMovement.updateMany({
      where: { id: input.movementId, companyId, status: "RECORDED" },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
      },
    });
    return { status: count === 1 ? "OK" : "ALREADY_VOIDED" };
  }, CASH_TX_OPTIONS);
}

// Movimientos de un turno, del más antiguo al más reciente (también los
// anulados).
export async function listSessionCashMovements(companyId: string, cashSessionId: string) {
  return db.cashMovement.findMany({
    where: { companyId, cashSessionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      amount: true,
      note: true,
      receiptPath: true,
      status: true,
      createdAt: true,
      voidedAt: true,
      voidReason: true,
      category: { select: { id: true, name: true } },
      user: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
}
