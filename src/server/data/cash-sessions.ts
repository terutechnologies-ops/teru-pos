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

export async function findOpenCashSession(companyId: string, userId: string) {
  return db.cashSession.findFirst({
    where: { companyId, userId, closedAt: null },
    select: {
      id: true,
      openingAmount: true,
      openedAt: true,
      branch: { select: { id: true, name: true } },
    },
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
// efectivo en ventas no anuladas (amount ya descuenta el cambio).
async function expectedCash(
  tx: Prisma.TransactionClient,
  companyId: string,
  cashSessionId: string,
) {
  const session = await tx.cashSession.findUniqueOrThrow({
    where: { id: cashSessionId },
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

// Solo su dueño cierra el turno. Después de cerrado no cambia: las ventas
// ya no se pueden anular (ver data/sales.ts).
export async function closeCashSession(
  companyId: string,
  input: { cashSessionId: string; userId: string; countedCash: string; closingNote: string | null },
): Promise<CloseCashSessionResult> {
  const countedCash = new Prisma.Decimal(input.countedCash);
  return db.$transaction(async (tx) => {
    const session = await lockCashSession(tx, companyId, input.cashSessionId, "UPDATE");
    if (!session || session.userId !== input.userId) return { status: "NOT_FOUND" };
    if (session.closedAt) return { status: "ALREADY_CLOSED" };

    const expected = await expectedCash(tx, companyId, input.cashSessionId);
    await tx.cashSession.update({
      where: { id: input.cashSessionId },
      data: {
        closedAt: new Date(),
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
