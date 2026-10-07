"use server";

import { getRequestContext, requirePermission } from "@/server/http/staff-session";
import { saveClosingReportRecipients } from "@/server/services/companies";

import { emailsToText, type ClosingReportFormState } from "./closing-report-fields";

// Configuración > Negocio: destinatarios del reporte de cierre.
export async function saveClosingReportAction(
  _prev: ClosingReportFormState,
  formData: FormData,
): Promise<ClosingReportFormState> {
  const session = await requirePermission(String(formData.get("company") ?? ""), "company.manage");
  const value = String(formData.get("emails") ?? "");

  let result;
  try {
    result = await saveClosingReportRecipients(session, value, await getRequestContext());
  } catch (error) {
    console.error("saveClosingReportAction: error inesperado", (error as Error).name);
    return { status: "error", message: "No se pudo guardar. Intenta de nuevo.", value };
  }
  if (!result.ok) return { status: "error", message: result.error, value };
  return {
    status: "saved",
    message:
      result.emails.length === 0
        ? "Guardado. El reporte de cierre no se enviará."
        : "Destinatarios guardados.",
    value: emailsToText(result.emails),
  };
}
