"use server";

import { redirect } from "next/navigation";

import {
  getRequestContext,
  requirePermission,
} from "@/server/http/staff-session";
import { completeCompanySetup } from "@/server/services/companies";

export type FinishSetupState = { error: string | null };

export async function finishSetupAction(
  _prev: FinishSetupState,
  formData: FormData,
): Promise<FinishSetupState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(
    String(formData.get("company") ?? ""),
    "company.manage",
  );

  try {
    await completeCompanySetup(session, await getRequestContext());
  } catch (error) {
    console.error("finishSetupAction: error inesperado", (error as Error).name);
    return {
      error: "No pudimos finalizar la configuración. Inténtalo de nuevo en un momento.",
    };
  }

  redirect(`/${session.company.slug}`);
}
