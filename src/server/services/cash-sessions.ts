import "server-only";

import { z } from "zod";

import {
  DEFAULT_TIME_ZONE,
  isDateFormat,
  isSameCalendarDay,
  type DateFormat,
} from "@/lib/company-formats";
import { listActiveBranches } from "@/server/data/branches";
import {
  closeCashSession,
  findCashSession,
  findOpenCashSession,
  openCashSession,
} from "@/server/data/cash-sessions";
import { findCompanySettings } from "@/server/data/companies";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission } from "@/server/services/auth/permissions";
import {
  closeShiftSchema,
  openShiftSchema,
  type CloseShiftInput,
  type OpenShiftInput,
} from "@/server/validations/cash";

// Turno de caja de quien vende (sales.charge). Cada persona abre, usa y
// cierra solo el suyo. Conteo ciego: el esperado no se muestra antes de
// cerrar (ver ADR 0007).

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

async function companyFormats(companyId: string) {
  const company = await findCompanySettings(companyId);
  if (!company) throw new Error("Empresa no encontrada");
  const dateFormat: DateFormat = isDateFormat(company.dateFormat)
    ? company.dateFormat
    : "DD/MM/YYYY";
  return { currency: company.currency, timeZone: company.timeZone || DEFAULT_TIME_ZONE, dateFormat };
}

// Lo que necesita el POS al cargar: el turno abierto (si hay) o lo
// necesario para abrir uno.
export async function getPosShift(session: StaffSessionDto, now = new Date()) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [formats, open, branches] = await Promise.all([
    companyFormats(companyId),
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
  const { currency } = await companyFormats(companyId);
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
  const { currency } = await companyFormats(companyId);
  const parsed = closeShiftSchema(currency).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const open = await findOpenCashSession(companyId, session.user.id);
  if (!open) return { ok: false, error: "No tienes un turno abierto. Actualiza la página." };

  const result = await closeCashSession(companyId, {
    cashSessionId: open.id,
    userId: session.user.id,
    countedCash: parsed.data.countedCash,
    closingNote: parsed.data.closingNote,
  });
  return result.status === "OK"
    ? { ok: true, cashSessionId: open.id }
    : { ok: false, error: "El turno ya estaba cerrado. Actualiza la página." };
}

// Resumen de un turno cerrado, solo para su dueño (la revisión de cierres
// del administrador llega en el componente 6). null si no aplica.
export async function getClosedShift(session: StaffSessionDto, cashSessionId: string) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [formats, row] = await Promise.all([
    companyFormats(companyId),
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
