"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import { voidSaleFromPanel, type VoidSaleResult } from "@/server/services/sales";

import type { VoidSaleFormState } from "./void-sale-fields";

const UNEXPECTED = "No pudimos anular la venta. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// Anulación desde el detalle de la venta. Al terminar vuelve al detalle con
// el aviso.
export async function voidSaleAction(
  _prev: VoidSaleFormState,
  formData: FormData,
): Promise<VoidSaleFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field(formData, "company"), "sales.void");
  const saleId = field(formData, "saleId");
  const reason = field(formData, "reason");

  let result: VoidSaleResult;
  try {
    result = await voidSaleFromPanel(session, saleId, { reason });
  } catch (error) {
    console.error("voidSaleAction: error inesperado", (error as Error).name);
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

  redirect(`/${session.company.slug}/ventas/${encodeURIComponent(saleId)}?aviso=anulada`);
}
