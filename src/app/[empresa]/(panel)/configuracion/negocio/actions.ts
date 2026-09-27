"use server";

import { refresh } from "next/cache";

import {
  profileErrorState,
  readProfileForm,
  type ProfileFormState,
} from "@/components/company/company-profile-fields";
import {
  getRequestContext,
  requirePermission,
} from "@/server/http/staff-session";
import { saveCompanyProfile } from "@/server/services/companies";

// Configuración > Negocio: guarda y se queda en la página.
export async function saveCompanySettingsAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const session = await requirePermission(
    String(formData.get("company") ?? ""),
    "company.manage",
  );
  const values = readProfileForm(formData);

  let result;
  try {
    result = await saveCompanyProfile(session, values, await getRequestContext());
  } catch (error) {
    console.error("saveCompanySettingsAction: error inesperado", (error as Error).name);
    return profileErrorState(values);
  }
  if (!result.ok) return profileErrorState(values, result.fieldErrors);

  // El nombre de la empresa aparece en el menú y en el título de la pestaña.
  refresh();
  return { status: "saved", message: "Cambios guardados.", fieldErrors: {}, values };
}
