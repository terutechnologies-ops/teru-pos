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

const movementSelect = {
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
} satisfies Prisma.CashMovementSelect;

// Movimientos de un turno, del más antiguo al más reciente (también los
// anulados).
export async function listSessionCashMovements(companyId: string, cashSessionId: string) {
  return db.cashMovement.findMany({
    where: { companyId, cashSessionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: movementSelect,
  });
}

export type CashMovementFilters = {
  // Momento del registro, [from, to).
  from: Date;
  to: Date;
  type?: CashMovementType;
  categoryId?: string;
  // Del turno: su cajero y su sucursal.
  userId?: string;
  branchId?: string;
};

function movementWhere(
  companyId: string,
  filters: CashMovementFilters,
): Prisma.CashMovementWhereInput {
  return {
    companyId,
    createdAt: { gte: filters.from, lt: filters.to },
    ...(filters.type && { type: filters.type }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...((filters.userId || filters.branchId) && {
      cashSession: {
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.branchId && { branchId: filters.branchId }),
      },
    }),
  };
}

// Movimientos del rango, el más reciente primero, con su turno.
export async function listCashMovements(
  companyId: string,
  filters: CashMovementFilters,
  take: number,
) {
  const where = movementWhere(companyId, filters);
  const [movements, total] = await Promise.all([
    db.cashMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        ...movementSelect,
        cashSession: {
          select: { id: true, user: { select: { name: true } }, branch: { select: { name: true } } },
        },
      },
    }),
    db.cashMovement.count({ where }),
  ]);
  return { movements, total };
}

// Resumen del rango completo (sin el filtro de tipo ni de categoría): sumas
// por tipo y categoría sin los anulados, y los anulados aparte.
export async function summarizeCashMovements(companyId: string, filters: CashMovementFilters) {
  const base = movementWhere(companyId, { ...filters, type: undefined, categoryId: undefined });
  const [recorded, voided] = await Promise.all([
    db.cashMovement.groupBy({
      by: ["type", "categoryId"],
      where: { ...base, status: "RECORDED" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.cashMovement.aggregate({
      where: { ...base, status: "VOIDED" },
      _count: true,
      _sum: { amount: true },
    }),
  ]);
  return {
    groups: recorded.map((row) => ({
      type: row.type,
      categoryId: row.categoryId,
      amount: row._sum.amount ?? new Prisma.Decimal(0),
      count: row._count._all,
    })),
    voidedCount: voided._count,
    voidedTotal: voided._sum.amount ?? new Prisma.Decimal(0),
  };
}

// Guarda la foto del recibo de un gasto recién registrado (solo si aún no
// tiene). false si no aplica.
export async function setCashMovementReceipt(
  companyId: string,
  movementId: string,
  receiptPath: string,
) {
  const { count } = await db.cashMovement.updateMany({
    where: { id: movementId, companyId, type: "EXPENSE", receiptPath: null },
    data: { receiptPath },
  });
  return count === 1;
}

// Recibo de un gasto con el dueño de su turno (para decidir quién lo ve).
export async function findCashMovementReceipt(companyId: string, movementId: string) {
  return db.cashMovement.findFirst({
    where: { id: movementId, companyId },
    select: { receiptPath: true, cashSession: { select: { userId: true } } },
  });
}

// Totales de un turno por tipo, sin los anulados.
export async function sumSessionCashMovements(companyId: string, cashSessionId: string) {
  const rows = await db.cashMovement.groupBy({
    by: ["type"],
    where: { companyId, cashSessionId, status: "RECORDED" },
    _sum: { amount: true },
  });
  const of = (type: CashMovementType) =>
    rows.find((row) => row.type === type)?._sum.amount ?? new Prisma.Decimal(0);
  return { expenses: of("EXPENSE"), withdrawals: of("WITHDRAWAL"), deposits: of("DEPOSIT") };
}
