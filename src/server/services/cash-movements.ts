import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { IMAGE_TYPES } from "@/lib/images";
import {
  findCashMovementReceipt,
  listSessionCashMovements,
  recordCashMovement,
  setCashMovementReceipt,
} from "@/server/data/cash-movements";
import { findOpenCashSession } from "@/server/data/cash-sessions";
import { findCompanyFormats } from "@/server/data/companies";
import { listExpenseCategories } from "@/server/data/expense-categories";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import { checkImageFile, NO_STORAGE } from "@/server/services/images";
import { getPrivateFileStorage } from "@/server/services/storage";
import { cashMovementSchema, type CashMovementInput } from "@/server/validations/cash-movements";

// Gastos, retiros e ingresos del turno propio en el POS (sales.charge; ver
// ADR 0010). El cajero ve sus movimientos, nunca el esperado (conteo
// ciego). Los anulan OWNER/ADMIN desde el panel.

// Lo que dura el enlace firmado de un recibo: se abre al instante.
const RECEIPT_LINK_SECONDS = 60;

type MovementRow = Awaited<ReturnType<typeof listSessionCashMovements>>[number];

// Montos como texto para la interfaz.
export function toCashMovement(row: MovementRow) {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount.toString(),
    categoryName: row.category?.name ?? null,
    note: row.note,
    hasReceipt: row.receiptPath !== null,
    createdAt: row.createdAt,
    userName: row.user.name,
    voided: row.status === "VOIDED"
      ? { at: row.voidedAt!, byName: row.voidedBy?.name ?? "", reason: row.voidReason ?? "" }
      : null,
  };
}

export type CashMovementDto = ReturnType<typeof toCashMovement>;

// Totales por tipo, sin los anulados.
export function cashMovementTotals(movements: CashMovementDto[]) {
  const sum = (type: CashMovementDto["type"]) =>
    movements
      .filter((movement) => movement.type === type && !movement.voided)
      .reduce((total, movement) => total.plus(movement.amount), new Prisma.Decimal(0))
      .toString();
  return { expenses: sum("EXPENSE"), withdrawals: sum("WITHDRAWAL"), deposits: sum("DEPOSIT") };
}

export type CashMovementTotals = ReturnType<typeof cashMovementTotals>;

// Movimientos del turno abierto propio, con las categorías activas para
// registrar otro. shift = null sin turno abierto.
export async function getShiftCashMovements(session: StaffSessionDto) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [formats, open, categories] = await Promise.all([
    findCompanyFormats(companyId),
    findOpenCashSession(companyId, session.user.id),
    listExpenseCategories(companyId, { activeOnly: true }),
  ]);
  if (!open) return { ...formats, shift: null, categories: [], movements: [], totals: null };
  const movements = (await listSessionCashMovements(companyId, open.id)).map(toCashMovement);
  return {
    ...formats,
    shift: { id: open.id, branchName: open.branch.name },
    categories: categories.map(({ id, name }) => ({ id, name })),
    movements,
    totals: cashMovementTotals(movements),
  };
}

export type CashMovementField = keyof CashMovementInput | "image";

export type RegisterCashMovementResult =
  | { ok: true; receiptFailed: boolean }
  | { ok: false; error: string; fieldErrors: Partial<Record<CashMovementField, string>> };

const SHIFT_GONE = "No tienes un turno abierto. Actualiza la página.";

function invalid(
  fieldErrors: Partial<Record<CashMovementField, string>>,
): RegisterCashMovementResult {
  return { ok: false, error: "Revisa los campos marcados.", fieldErrors };
}

// Registra en el turno abierto propio. La foto (solo en gastos) se valida
// antes de registrar; si lo único que falla es subirla, el gasto queda sin
// foto y se avisa (receiptFailed).
export async function registerCashMovement(
  session: StaffSessionDto,
  input: CashMovementInput,
  image: Blob | null = null,
): Promise<RegisterCashMovementResult> {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = cashMovementSchema(currency).safeParse(input);
  const withImage = Boolean(image && image.size > 0) && input.type === "EXPENSE";
  const storage = withImage ? getPrivateFileStorage() : null;
  const checked = withImage ? (storage ? await checkImageFile(image) : NO_STORAGE) : null;
  const imageError = checked && !checked.ok ? checked.error : undefined;
  if (!parsed.success || imageError) {
    const fieldErrors = parsed.success
      ? {}
      : Object.fromEntries(
          Object.entries(z.flattenError(parsed.error).fieldErrors).map(([field, errors]) => [
            field,
            (errors as string[])[0],
          ]),
        );
    return invalid({ ...fieldErrors, image: imageError });
  }

  const open = await findOpenCashSession(companyId, session.user.id);
  if (!open) return { ok: false, error: SHIFT_GONE, fieldErrors: {} };
  const result = await recordCashMovement(companyId, {
    cashSessionId: open.id,
    userId: session.user.id,
    ...parsed.data,
  });
  switch (result.status) {
    case "OK":
      break;
    case "SESSION_NOT_FOUND":
    case "SESSION_CLOSED":
      return { ok: false, error: SHIFT_GONE, fieldErrors: {} };
    case "CATEGORY_NOT_FOUND":
    case "CATEGORY_INACTIVE":
      return invalid({ categoryId: "Esa categoría ya no está disponible. Elige otra." });
  }

  if (!checked?.ok || !storage) return { ok: true, receiptFailed: false };
  const { bytes, type } = checked.image;
  const path = `companies/${companyId}/receipts/${result.movementId}-${randomUUID()}.${IMAGE_TYPES[type]}`;
  try {
    await storage.upload(path, bytes, type);
    if (await setCashMovementReceipt(companyId, result.movementId, path)) {
      return { ok: true, receiptFailed: false };
    }
    await storage.remove(path);
  } catch (error) {
    console.error("registerCashMovement: no se pudo guardar el recibo", (error as Error).message);
  }
  return { ok: true, receiptFailed: true };
}

// Enlace firmado y corto al recibo de un gasto. Lo ven el dueño del turno y
// quien revisa cierres (cash.review). null si no hay recibo o no le
// corresponde.
export async function getReceiptUrl(session: StaffSessionDto, movementId: string) {
  const movement = await findCashMovementReceipt(session.company.id, movementId);
  if (!movement?.receiptPath) return null;
  const { role } = session.user;
  const allowed =
    hasPermission(role, "cash.review") ||
    (hasPermission(role, "sales.charge") && movement.cashSession.userId === session.user.id);
  if (!allowed) return null;
  const storage = getPrivateFileStorage();
  return storage ? storage.signedUrl(movement.receiptPath, RECEIPT_LINK_SECONDS) : null;
}
