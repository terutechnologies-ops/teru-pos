"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import {
  voidCashMovementFromPanel,
  type VoidCashMovementResult,
} from "@/server/services/cash-movements";

import type { VoidCashMovementFormState } from "./void-cash-movement-fields";

const UNEXPECTED = "No pudimos anular el movimiento. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// Anulación desde el detalle del turno. Al terminar vuelve al turno con el
// aviso.
export async function voidCashMovementAction(
  _prev: VoidCashMovementFormState,
  formData: FormData,
): Promise<VoidCashMovementFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field(formData, "company"), "cash.void");
  const movementId = field(formData, "movementId");
  const cashSessionId = field(formData, "cashSessionId");
  const reason = field(formData, "reason");

  let result: VoidCashMovementResult;
  try {
    result = await voidCashMovementFromPanel(session, movementId, { reason });
  } catch (error) {
    console.error("voidCashMovementAction: error inesperado", (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, reason };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: result.error ?? null,
      fieldErrors: result.fieldErrors,
      reason,
    };
  }

  redirect(
    `/${session.company.slug}/caja/${encodeURIComponent(cashSessionId)}?aviso=movimiento-anulado`,
  );
}
