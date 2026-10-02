import "server-only";

import { z } from "zod";

import {
  calendarDay,
  isSameCalendarDay,
  resolveDayRange,
  startOfCalendarDay,
} from "@/lib/company-formats";
import { listActiveBranches } from "@/server/data/branches";
import {
  closeCashSession,
  countOpenCashSessionsBefore,
  findCashSession,
  findCashSessionReview,
  findOpenCashSession,
  listCashSessionUsers,
  listClosedCashSessions,
  listOpenCashSessions,
  openCashSession,
} from "@/server/data/cash-sessions";
import { findCompanyFormats } from "@/server/data/companies";
import { listPaymentMethods } from "@/server/data/payment-methods";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import {
  closeOthersShiftSchema,
  closeShiftSchema,
  openShiftSchema,
  type CloseShiftInput,
  type OpenShiftInput,
} from "@/server/validations/cash";

// Turno de caja de quien vende (sales.charge). Cada persona abre, usa y
// cierra solo el suyo. Conteo ciego: el esperado no se muestra antes de
// cerrar (ver ADR 0007). Al final, la revisión de cierres del panel, donde
// un administrador también cierra el turno que otra persona olvidó.

type CashSessionRow = NonNullable<Awaited<ReturnType<typeof findCashSession>>>;

// Montos como texto para la interfaz (los Decimal no viajan al cliente).
function toShift(row: CashSessionRow) {
  return {
    id: row.id,
    branchName: row.branch.name,
    openingAmount: row.openingAmount.toString(),
    openedAt: row.openedAt,
    salesCount: row._count.sales,
  };
}

export type ShiftDto = ReturnType<typeof toShift>;

// Lo que necesita el POS al cargar: el turno abierto (si hay) o lo
// necesario para abrir uno.
export async function getPosShift(session: StaffSessionDto, now = new Date()) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [formats, open, branches] = await Promise.all([
    findCompanyFormats(companyId),
    findOpenCashSession(companyId, session.user.id),
    listActiveBranches(companyId),
  ]);
  return {
    ...formats,
    branches,
    shift: open && toShift(open),
    // Abierto en un día anterior: se pide cerrarlo antes de seguir.
    stale: open ? !isSameCalendarDay(open.openedAt, now, formats.timeZone) : false,
  };
}

export type PosShift = Awaited<ReturnType<typeof getPosShift>>;

export type ShiftField = keyof OpenShiftInput | keyof CloseShiftInput;

export type ShiftResult =
  | { ok: true; cashSessionId: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<ShiftField, string>> };

function invalid(error: z.ZodError): ShiftResult {
  const { fieldErrors } = z.flattenError(error);
  return {
    ok: false,
    error: "Revisa los campos marcados.",
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, errors]) => [field, (errors as string[])[0]]),
    ),
  };
}

export async function openShift(
  session: StaffSessionDto,
  input: OpenShiftInput,
): Promise<ShiftResult> {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = openShiftSchema(currency).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  let branchId = parsed.data.branchId;
  if (!branchId) {
    // Sin elegir: solo vale si hay una única sucursal activa.
    const branches = await listActiveBranches(companyId);
    if (branches.length !== 1) {
      return {
        ok: false,
        error: "Revisa los campos marcados.",
        fieldErrors: { branchId: "Elige la sucursal." },
      };
    }
    branchId = branches[0].id;
  }

  const result = await openCashSession(companyId, {
    userId: session.user.id,
    branchId,
    openingAmount: parsed.data.openingAmount,
  });
  switch (result.status) {
    case "OK":
      return { ok: true, cashSessionId: result.cashSessionId };
    case "ALREADY_OPEN":
      return { ok: false, error: "Ya tienes un turno abierto. Actualiza la página." };
    case "BRANCH_NOT_FOUND":
      return {
        ok: false,
        error: "Revisa los campos marcados.",
        fieldErrors: { branchId: "La sucursal ya no está disponible." },
      };
  }
}

export async function closeShift(
  session: StaffSessionDto,
  input: CloseShiftInput,
): Promise<ShiftResult> {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = closeShiftSchema(currency).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const open = await findOpenCashSession(companyId, session.user.id);
  if (!open) return { ok: false, error: "No tienes un turno abierto. Actualiza la página." };

  const result = await closeCashSession(companyId, {
    cashSessionId: open.id,
    userId: session.user.id,
    onlyOwner: true,
    countedCash: parsed.data.countedCash,
    closingNote: parsed.data.closingNote,
  });
  return result.status === "OK"
    ? { ok: true, cashSessionId: open.id }
    : { ok: false, error: "El turno ya estaba cerrado. Actualiza la página." };
}

// Resumen de un turno cerrado, solo para su dueño (el administrador los
// revisa con getCashSessionReview). null si no aplica.
export async function getClosedShift(session: StaffSessionDto, cashSessionId: string) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [formats, row] = await Promise.all([
    findCompanyFormats(companyId),
    findCashSession(companyId, cashSessionId),
  ]);
  if (!row || row.userId !== session.user.id || !row.closedAt) return null;
  if (!row.expectedCash || !row.countedCash) return null;
  return {
    ...formats,
    shift: {
      ...toShift(row),
      closedAt: row.closedAt,
      expectedCash: row.expectedCash.toString(),
      countedCash: row.countedCash.toString(),
      // contado − esperado: negativo = faltante, positivo = sobrante.
      difference: row.countedCash.minus(row.expectedCash).toString(),
      closingNote: row.closingNote,
    },
  };
}

// --- Revisión de cierres en el panel (cash.review / cash.close) ------------

// Turnos cerrados que muestra la lista (los más recientes del rango).
export const CASH_REVIEW_LIMIT = 200;

type ReviewRow = Awaited<ReturnType<typeof listOpenCashSessions>>[number];

// Montos como texto. difference = contado − esperado (negativo = faltante).
function toReviewShift(row: ReviewRow) {
  const closed =
    row.closedAt && row.expectedCash && row.countedCash
      ? {
          at: row.closedAt,
          expectedCash: row.expectedCash.toString(),
          countedCash: row.countedCash.toString(),
          difference: row.countedCash.minus(row.expectedCash).toString(),
          note: row.closingNote,
          // Solo si no lo cerró su dueño.
          byOtherName:
            row.closedBy && row.closedBy.id !== row.userId ? row.closedBy.name : null,
        }
      : null;
  return {
    id: row.id,
    cashierName: row.user.name,
    branchName: row.branch.name,
    openingAmount: row.openingAmount.toString(),
    openedAt: row.openedAt,
    salesCount: row._count.sales,
    closed,
  };
}

export type ReviewShift = ReturnType<typeof toReviewShift>;

export type CashReviewQuery = {
  desde?: string;
  hasta?: string;
  cajero?: string;
  sucursal?: string;
};

export async function getCashOverview(
  session: StaffSessionDto,
  query: CashReviewQuery,
  now = new Date(),
) {
  assertPermission(session, "cash.review");
  const companyId = session.company.id;
  const formats = await findCompanyFormats(companyId);
  const days = resolveDayRange(query, formats.timeZone, now);

  const [open, closed, users, branches] = await Promise.all([
    listOpenCashSessions(companyId),
    listClosedCashSessions(
      companyId,
      {
        from: days.start,
        to: days.end,
        userId: query.cajero || undefined,
        branchId: query.sucursal || undefined,
      },
      CASH_REVIEW_LIMIT,
    ),
    listCashSessionUsers(companyId),
    listActiveBranches(companyId),
  ]);
  const todayStart = startOfCalendarDay(days.today, formats.timeZone);

  return {
    ...formats,
    filters: {
      from: days.from,
      to: days.to,
      cashierId: query.cajero ?? "",
      branchId: query.sucursal ?? "",
    },
    today: days.today,
    cashiers: users,
    branches: branches.length > 1 ? branches.map(({ id, name }) => ({ id, name })) : [],
    // Abiertos sin importar el rango; stale = abierto antes de hoy.
    open: open.map((row) => ({ ...toReviewShift(row), stale: row.openedAt < todayStart })),
    closed: closed.sessions.map(toReviewShift),
    closedCount: closed.total,
    summary: {
      shortageTotal: closed.shortages.total.toString(),
      shortageCount: closed.shortages.count,
      surplusTotal: closed.surpluses.total.toString(),
      surplusCount: closed.surpluses.count,
    },
  };
}

export type CashOverview = Awaited<ReturnType<typeof getCashOverview>>;

export async function getCashSessionReview(session: StaffSessionDto, cashSessionId: string) {
  assertPermission(session, "cash.review");
  const companyId = session.company.id;
  const [row, formats, methods] = await Promise.all([
    findCashSessionReview(companyId, cashSessionId),
    findCompanyFormats(companyId),
    listPaymentMethods(companyId),
  ]);
  if (!row) return null;
  const amounts = new Map(row.byMethod.map((entry) => [entry.paymentMethodId, entry.amount]));
  const cashMethod = methods.find((method) => method.isCash);

  return {
    ...formats,
    shift: {
      ...toReviewShift(row),
      // Efectivo cobrado en ventas no anuladas (el esperado sin el fondo).
      cashSales: (cashMethod && amounts.get(cashMethod.id)?.toString()) ?? "0",
      // Abierto: lo que debería haber hasta ahora.
      liveExpected: row.liveExpected?.toString() ?? null,
      byMethod: methods
        .filter((method) => amounts.has(method.id))
        .map((method) => ({ name: method.name, amount: amounts.get(method.id)!.toString() })),
      sales: row.sales.map((sale) => ({
        id: sale.id,
        number: sale.number,
        createdAt: sale.createdAt,
        total: sale.total.toString(),
        voided: sale.status === "VOIDED",
      })),
    },
    canClose: row.closedAt === null && hasPermission(session.user.role, "cash.close"),
  };
}

export type CashSessionReview = NonNullable<Awaited<ReturnType<typeof getCashSessionReview>>>;

// Cierra el turno que otra persona dejó abierto: quien cierra cuenta el
// efectivo y deja el motivo. Sus ventas ya no se pueden anular.
export async function closeShiftFromPanel(
  session: StaffSessionDto,
  cashSessionId: string,
  input: CloseShiftInput,
): Promise<ShiftResult> {
  assertPermission(session, "cash.close");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = closeOthersShiftSchema(currency).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await closeCashSession(companyId, {
    cashSessionId,
    userId: session.user.id,
    onlyOwner: false,
    countedCash: parsed.data.countedCash,
    closingNote: parsed.data.closingNote,
  });
  switch (result.status) {
    case "OK":
      return { ok: true, cashSessionId };
    case "NOT_FOUND":
      return { ok: false, error: "El turno ya no existe. Actualiza la página." };
    case "ALREADY_CLOSED":
      return { ok: false, error: "El turno ya estaba cerrado. Actualiza la página." };
  }
}

// Alerta del inicio: turnos abiertos desde un día anterior.
export async function countStaleShifts(session: StaffSessionDto, now = new Date()) {
  assertPermission(session, "cash.review");
  const companyId = session.company.id;
  const { timeZone } = await findCompanyFormats(companyId);
  return countOpenCashSessionsBefore(
    companyId,
    startOfCalendarDay(calendarDay(now, timeZone), timeZone),
  );
}
