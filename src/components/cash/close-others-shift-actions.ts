"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import { closeShiftFromPanel, type ShiftResult } from "@/server/services/cash-sessions";

import type { CloseOthersShiftFormState } from "./close-others-shift-fields";

const UNEXPECTED = "No pudimos cerrar el turno. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// Cierre del turno de otra persona desde su detalle. Al terminar vuelve al
// detalle con el aviso.
export async function closeShiftFromPanelAction(
  _prev: CloseOthersShiftFormState,
  formData: FormData,
): Promise<CloseOthersShiftFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field(formData, "company"), "cash.close");
  const cashSessionId = field(formData, "cashSessionId");
  const values = {
    countedCash: field(formData, "countedCash"),
    closingNote: field(formData, "closingNote"),
  };

  let result: ShiftResult;
  try {
    result = await closeShiftFromPanel(session, cashSessionId, values);
  } catch (error) {
    console.error("closeShiftFromPanelAction: error inesperado", (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, values };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: result.error,
      fieldErrors: {
        countedCash: result.fieldErrors?.countedCash,
        closingNote: result.fieldErrors?.closingNote,
      },
      values,
    };
  }

  redirect(`/${session.company.slug}/caja/${encodeURIComponent(cashSessionId)}?aviso=cerrado`);
}
