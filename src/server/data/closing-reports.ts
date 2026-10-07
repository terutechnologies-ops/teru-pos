import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { ClosingReportStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

import { CASH_TX_OPTIONS } from "./cash-sessions";

// Reportes de cierre: la reserva (quién envía y qué período cubre) y su
// historial. Ver ClosingReport en el esquema.

// Sin reporte anterior, el primero cubre las últimas 24 h (no todo el
// historial de la empresa).
const FIRST_PERIOD_MS = 24 * 60 * 60 * 1000;

export type ClosingReportClaim = {
  id: string;
  periodStart: Date;
  // Fin del período (createdAt del reporte).
  cutoff: Date;
};

// Reserva el reporte si ya no queda ningún turno abierto en la empresa y
// hay turnos cerrados después del último reporte. Bloquea la fila de la
// empresa: con dos cierres a la vez, el segundo ve el reporte del primero y
// no reserva otro. Sin destinatarios queda SKIPPED (marca el corte).
// null = no corresponde enviar.
export async function claimClosingReport(
  companyId: string,
  input: { cashSessionId: string; recipientCount: number },
  now = new Date(),
): Promise<ClosingReportClaim | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "companies" WHERE "id" = ${companyId} FOR UPDATE`;
    const open = await tx.cashSession.count({ where: { companyId, closedAt: null } });
    if (open > 0) return null;

    const last = await tx.closingReport.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const periodStart = last?.createdAt ?? new Date(now.getTime() - FIRST_PERIOD_MS);
    if (periodStart >= now) return null;
    const closed = await tx.cashSession.count({
      where: { companyId, closedAt: { gt: periodStart, lte: now } },
    });
    if (closed === 0) return null;

    const skipped = input.recipientCount === 0;
    const report = await tx.closingReport.create({
      data: {
        companyId,
        cashSessionId: input.cashSessionId,
        periodStart,
        createdAt: now,
        status: skipped ? "SKIPPED" : "PENDING",
        recipientCount: input.recipientCount,
        finishedAt: skipped ? now : null,
      },
      select: { id: true },
    });
    return { id: report.id, periodStart, cutoff: now };
  }, CASH_TX_OPTIONS);
}

export async function finishClosingReport(
  companyId: string,
  reportId: string,
  result: { status: Extract<ClosingReportStatus, "SENT" | "FAILED">; sentCount: number; error: string | null },
) {
  await db.closingReport.updateMany({
    where: { id: reportId, companyId, status: "PENDING" },
    data: { ...result, error: result.error?.slice(0, 500) ?? null, finishedAt: new Date() },
  });
}

// Último reporte (Configuración > Negocio).
export async function findLastClosingReport(companyId: string) {
  return db.closingReport.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      status: true,
      recipientCount: true,
      sentCount: true,
      error: true,
    },
  });
}

// Lo que resume el reporte: los turnos cerrados en (periodStart, cutoff],
// sus ventas (por método de pago y anuladas aparte) y sus movimientos de
// caja sin los anulados.
export async function findClosingReportPeriod(
  companyId: string,
  period: { periodStart: Date; cutoff: Date },
) {
  const sessions = await db.cashSession.findMany({
    where: { companyId, closedAt: { gt: period.periodStart, lte: period.cutoff } },
    orderBy: { closedAt: "asc" },
    select: {
      id: true,
      closedAt: true,
      expectedCash: true,
      countedCash: true,
      user: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  const ids = sessions.map((session) => session.id);
  const sale = { companyId, cashSessionId: { in: ids } };
  const [completed, voided, byMethod, movements, methods] = await Promise.all([
    db.sale.aggregate({ where: { ...sale, status: "COMPLETED" }, _count: true, _sum: { total: true } }),
    db.sale.aggregate({ where: { ...sale, status: "VOIDED" }, _count: true, _sum: { total: true } }),
    db.salePayment.groupBy({
      by: ["paymentMethodId"],
      where: { companyId, sale: { ...sale, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    db.cashMovement.groupBy({
      by: ["type"],
      where: { companyId, cashSessionId: { in: ids }, status: "RECORDED" },
      _sum: { amount: true },
    }),
    db.paymentMethod.findMany({
      where: { companyId },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const zero = new Prisma.Decimal(0);
  const movement = (type: "EXPENSE" | "WITHDRAWAL" | "DEPOSIT") =>
    movements.find((row) => row.type === type)?._sum.amount ?? zero;
  return {
    sessions,
    sales: {
      count: completed._count,
      total: completed._sum.total ?? zero,
      voidedCount: voided._count,
      voidedTotal: voided._sum.total ?? zero,
      // En el orden de los métodos de pago de la empresa.
      byMethod: methods.flatMap((method) => {
        const row = byMethod.find((entry) => entry.paymentMethodId === method.id);
        return row ? [{ name: method.name, amount: row._sum.amount ?? zero }] : [];
      }),
    },
    cash: {
      expenses: movement("EXPENSE"),
      withdrawals: movement("WITHDRAWAL"),
      deposits: movement("DEPOSIT"),
    },
  };
}

export type ClosingReportPeriod = Awaited<ReturnType<typeof findClosingReportPeriod>>;
