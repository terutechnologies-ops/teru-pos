"use server";

import { redirect } from "next/navigation";

import type { NewPasswordFormState } from "@/components/shared/new-password-form";
import { getRequestContext } from "@/server/http/staff-session";
import { acceptInvitation } from "@/server/services/team";

export async function acceptInvitationAction(
  _prev: NewPasswordFormState,
  formData: FormData,
): Promise<NewPasswordFormState> {
  const companySlug = String(formData.get("company") ?? "");
  let result;
  try {
    result = await acceptInvitation(
      companySlug,
      {
        token: formData.get("token"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
      },
      await getRequestContext(),
    );
  } catch (error) {
    console.error("acceptInvitationAction: error inesperado", (error as Error).name);
    return {
      formError: "No pudimos crear tu cuenta. Inténtalo de nuevo.",
      tokenInvalid: false,
      fieldErrors: {},
    };
  }

  if (result.ok) redirect(`/${result.companySlug}/login?cuenta=creada`);
  if (result.error === "INVALID_TOKEN") {
    return { formError: null, tokenInvalid: true, fieldErrors: {} };
  }
  if (result.error === "EMAIL_TAKEN") {
    return {
      formError:
        "Este correo ya tiene una cuenta en la empresa. Inicia sesión o recupera tu contraseña.",
      tokenInvalid: false,
      fieldErrors: {},
    };
  }
  return { formError: null, tokenInvalid: false, fieldErrors: result.fieldErrors };
}
