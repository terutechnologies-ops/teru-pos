"use server";

import { refresh } from "next/cache";

import { requirePermission } from "@/server/http/staff-session";
import { saveCompanyProfile } from "@/server/services/companies";

import {
  OTHER_CURRENCY,
  type ProfileFormState,
  type ProfileFormValues,
} from "./profile-fields";

export async function saveCompanyProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  // Viene del cliente como cualquier otro campo: requirePermission valida la
  // sesión en esa empresa y el permiso.
  const session = await requirePermission(field("company"), "company.setup");

  const currencyChoice = field("currency");
  const values: ProfileFormValues = {
    name: field("name"),
    taxId: field("taxId"),
    phone: field("phone"),
    email: field("email"),
    address: field("address"),
    currency:
      currencyChoice === OTHER_CURRENCY ? field("otherCurrency") : currencyChoice,
    dateFormat: field("dateFormat"),
  };

  let result;
  try {
    result = await saveCompanyProfile(session, values);
  } catch (error) {
    console.error("saveCompanyProfileAction: error inesperado", (error as Error).name);
    return {
      status: "error",
      message: "No pudimos guardar los datos. Inténtalo de nuevo en un momento.",
      fieldErrors: {},
      values,
    };
  }

  if (!result.ok) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: result.fieldErrors,
      values,
    };
  }

  // El nombre de la empresa aparece en el encabezado del asistente.
  refresh();
  return { status: "saved", message: null, fieldErrors: {}, values };
}
