"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import {
  voidCustomerPaymentFromPanel,
  type VoidCustomerPaymentResult,
} from "@/server/services/customer-payments";

import type { VoidInShiftFormState } from "./void-in-shift-fields";

const UNEXPECTED = "No pudimos anular el abono. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// Anulación de un abono desde el detalle del turno. Al terminar vuelve al
// turno con el aviso.
export async function voidCustomerPaymentAction(
  _prev: VoidInShiftFormState,
  formData: FormData,
): Promise<VoidInShiftFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field(formData, "company"), "cash.void");
  const paymentId = field(formData, "recordId");
  const cashSessionId = field(formData, "cashSessionId");
  const reason = field(formData, "reason");

  let result: VoidCustomerPaymentResult;
  try {
    result = await voidCustomerPaymentFromPanel(session, paymentId, { reason });
  } catch (error) {
    console.error("voidCustomerPaymentAction: error inesperado", (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, reason };
  }
  if (!result.ok) {
    return { status: "error", message: result.error ?? null, fieldErrors: result.fieldErrors, reason };
  }

  redirect(
    `/${session.company.slug}/caja/${encodeURIComponent(cashSessionId)}?aviso=abono-anulado`,
  );
}
