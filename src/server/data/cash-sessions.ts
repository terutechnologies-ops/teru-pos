import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Turnos de caja: cada persona abre el suyo en una sucursal con un fondo
// inicial y lo cierra contando el efectivo. Los montos entran como texto
// decimal ya validado ("100000", "52500.5").

// Mismo margen que los movimientos de inventario (latencia a Supabase).
export const CASH_TX_OPTIONS = { timeout: 30_000 };

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

const cashSessionSelect = {
  id: true,
  userId: true,
  openingAmount: true,
  openedAt: true,
  closedAt: true,
  expectedCash: true,
  countedCash: true,
  closingNote: true,
  branch: { select: { id: true, name: true } },
  // Ventas no anuladas del turno.
  _count: { select: { sales: { where: { status: "COMPLETED" } } } },
} satisfies Prisma.CashSessionSelect;

export async function findOpenCashSession(companyId: string, userId: string) {
  return db.cashSession.findFirst({
    where: { companyId, userId, closedAt: null },
    select: cashSessionSelect,
  });
}

export async function findCashSession(companyId: string, cashSessionId: string) {
  return db.cashSession.findFirst({
    where: { id: cashSessionId, companyId },
    select: cashSessionSelect,
  });
}

export type OpenCashSessionResult =
  | { status: "OK"; cashSessionId: string }
  | { status: "ALREADY_OPEN" | "BRANCH_NOT_FOUND" };

export async function openCashSession(
  companyId: string,
  input: { userId: string; branchId: string; openingAmount: string },
): Promise<OpenCashSessionResult> {
  const branch = await db.branch.findFirst({
    where: { id: input.branchId, companyId, isActive: true },
    select: { id: true },
  });
  if (!branch) return { status: "BRANCH_NOT_FOUND" };
  try {
    const session = await db.cashSession.create({
      data: {
        companyId,
        branchId: input.branchId,
        userId: input.userId,
        openingAmount: new Prisma.Decimal(input.openingAmount),
      },
      select: { id: true },
    });
    return { status: "OK", cashSessionId: session.id };
  } catch (error) {
    // Índice parcial: un solo turno abierto por persona.
    if (prismaCode(error) === "P2002") return { status: "ALREADY_OPEN" };
    throw error;
  }
}

type LockedCashSession = { userId: string; branchId: string; closedAt: Date | null };

// Bloquea la fila del turno hasta el fin de la transacción. Las ventas y
// anulaciones la toman compartida (FOR SHARE): corren en paralelo entre sí,
// pero el cierre (FOR UPDATE) espera a que terminen y ninguna entra después.
export async function lockCashSession(
  tx: Prisma.TransactionClient,
  companyId: string,
  cashSessionId: string,
  mode: "SHARE" | "UPDATE",
): Promise<LockedCashSession | null> {
  const rows =
    mode === "SHARE"
      ? await tx.$queryRaw<LockedCashSession[]>`
          SELECT "userId", "branchId", "closedAt" FROM "cash_sessions"
          WHERE "id" = ${cashSessionId} AND "companyId" = ${companyId}
          FOR SHARE`
      : await tx.$queryRaw<LockedCashSession[]>`
          SELECT "userId", "branchId", "closedAt" FROM "cash_sessions"
          WHERE "id" = ${cashSessionId} AND "companyId" = ${companyId}
          FOR UPDATE`;
  return rows[0] ?? null;
}

// Efectivo que debería haber en la caja: fondo inicial + lo cobrado en
// efectivo en ventas no anuladas (amount ya descuenta el cambio). Fuera de
// una transacción sirve para ver cómo va un turno abierto.
export async function expectedCash(
  tx: Prisma.TransactionClient,
  companyId: string,
  cashSessionId: string,
) {
  const session = await tx.cashSession.findFirstOrThrow({
    where: { id: cashSessionId, companyId },
    select: { openingAmount: true },
  });
  const cash = await tx.salePayment.aggregate({
    where: {
      companyId,
      paymentMethod: { isCash: true },
      sale: { cashSessionId, status: "COMPLETED" },
    },
    _sum: { amount: true },
  });
  return session.openingAmount.plus(cash._sum.amount ?? 0);
}

export type CloseCashSessionResult =
  | {
      status: "OK";
      expectedCash: Prisma.Decimal;
      countedCash: Prisma.Decimal;
      // contado − esperado: negativo = faltante, positivo = sobrante.
      difference: Prisma.Decimal;
    }
  | { status: "NOT_FOUND" | "ALREADY_CLOSED" };

// Cierra el turno: su dueño desde el POS (onlyOwner) o un administrador
// desde el panel, que debe dar el motivo en closingNote (CHECK en la
// migración). Después de cerrado no cambia: las ventas ya no se pueden
// anular (ver data/sales.ts).
export async function closeCashSession(
  companyId: string,
  input: {
    cashSessionId: string;
    // Quién cierra.
    userId: string;
    onlyOwner: boolean;
    countedCash: string;
    closingNote: string | null;
  },
): Promise<CloseCashSessionResult> {
  const countedCash = new Prisma.Decimal(input.countedCash);
  return db.$transaction(async (tx) => {
    const session = await lockCashSession(tx, companyId, input.cashSessionId, "UPDATE");
    if (!session || (input.onlyOwner && session.userId !== input.userId)) {
      return { status: "NOT_FOUND" };
    }
    if (session.closedAt) return { status: "ALREADY_CLOSED" };

    const expected = await expectedCash(tx, companyId, input.cashSessionId);
    await tx.cashSession.update({
      where: { id: input.cashSessionId },
      data: {
        closedAt: new Date(),
        closedById: input.userId,
        expectedCash: expected,
        countedCash,
        closingNote: input.closingNote,
      },
    });
    return {
      status: "OK",
      expectedCash: expected,
      countedCash,
      difference: countedCash.minus(expected),
    };
  }, CASH_TX_OPTIONS);
}

// --- Revisión de cierres (panel) -------------------------------------------

const reviewSelect = {
  id: true,
  userId: true,
  openingAmount: true,
  openedAt: true,
  closedAt: true,
  expectedCash: true,
  countedCash: true,
  closingNote: true,
  user: { select: { name: true } },
  closedBy: { select: { id: true, name: true } },
  branch: { select: { name: true } },
  _count: { select: { sales: { where: { status: "COMPLETED" } } } },
} satisfies Prisma.CashSessionSelect;

// Todos los turnos abiertos de la empresa, el más antiguo primero.
export async function listOpenCashSessions(companyId: string) {
  return db.cashSession.findMany({
    where: { companyId, closedAt: null },
    orderBy: { openedAt: "asc" },
    select: reviewSelect,
  });
}

// Abiertos antes de ese instante (turnos olvidados de días anteriores).
export async function countOpenCashSessionsBefore(companyId: string, before: Date) {
  return db.cashSession.count({
    where: { companyId, closedAt: null, openedAt: { lt: before } },
  });
}

export type CashSessionFilters = {
  // Día de apertura, [from, to).
  from: Date;
  to: Date;
  userId?: string;
  branchId?: string;
};

// Turnos cerrados abiertos en el rango, el más reciente primero.
export async function listClosedCashSessions(
  companyId: string,
  filters: CashSessionFilters,
  take: number,
) {
  const where: Prisma.CashSessionWhereInput = {
    companyId,
    closedAt: { not: null },
    openedAt: { gte: filters.from, lt: filters.to },
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.branchId && { branchId: filters.branchId }),
  };
  const [sessions, total, all] = await Promise.all([
    db.cashSession.findMany({ where, orderBy: { openedAt: "desc" }, take, select: reviewSelect }),
    db.cashSession.count({ where }),
    // Diferencias del rango completo (no solo de las filas mostradas).
    db.cashSession.findMany({ where, select: { expectedCash: true, countedCash: true } }),
  ]);
  const shortages = { total: new Prisma.Decimal(0), count: 0 };
  const surpluses = { total: new Prisma.Decimal(0), count: 0 };
  for (const row of all) {
    if (!row.expectedCash || !row.countedCash) continue;
    const difference = row.countedCash.minus(row.expectedCash);
    if (difference.isNegative()) {
      shortages.total = shortages.total.plus(difference.negated());
      shortages.count += 1;
    } else if (!difference.isZero()) {
      surpluses.total = surpluses.total.plus(difference);
      surpluses.count += 1;
    }
  }
  return { sessions, total, shortages, surpluses };
}

// Último turno que cerró esa persona (el cajero solo reimprime ese).
export async function findLastClosedCashSessionId(companyId: string, userId: string) {
  const session = await db.cashSession.findFirst({
    where: { companyId, userId, closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    select: { id: true },
  });
  return session?.id ?? null;
}

// Quienes han tenido turnos (incluye personas ya desactivadas).
export async function listCashSessionUsers(companyId: string) {
  return db.user.findMany({
    where: { companyId, cashSessions: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function findCashSessionReview(companyId: string, cashSessionId: string) {
  const session = await db.cashSession.findFirst({
    where: { id: cashSessionId, companyId },
    select: {
      ...reviewSelect,
      sales: {
        orderBy: { number: "desc" },
        select: { id: true, number: true, createdAt: true, total: true, status: true },
      },
    },
  });
  if (!session) return null;
  const [byMethod, liveExpected] = await Promise.all([
    db.salePayment.groupBy({
      by: ["paymentMethodId"],
      where: { companyId, sale: { cashSessionId, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    // Abierto: lo que debería haber hasta ahora.
    session.closedAt ? null : expectedCash(db, companyId, cashSessionId),
  ]);
  return {
    ...session,
    byMethod: byMethod.map((row) => ({
      paymentMethodId: row.paymentMethodId,
      amount: row._sum.amount ?? new Prisma.Decimal(0),
    })),
    liveExpected,
  };
}
