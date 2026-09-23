"use server";

import { redirect } from "next/navigation";

import { getRequestContext } from "@/server/http/staff-session";
import { resetStaffPassword } from "@/server/services/auth/password-reset";

export type ResetFormState = {
  formError: string | null;
  tokenInvalid: boolean;
  fieldErrors: { password?: string; confirmPassword?: string };
};

export async function resetPasswordAction(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const companySlug = String(formData.get("company") ?? "");
  let result;
  try {
    result = await resetStaffPassword(
      companySlug,
      {
        token: formData.get("token"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
      },
      await getRequestContext(),
    );
  } catch (error) {
    console.error("resetPasswordAction: error inesperado", (error as Error).name);
    return {
      formError: "No pudimos actualizar la contraseña. Inténtalo de nuevo.",
      tokenInvalid: false,
      fieldErrors: {},
    };
  }

  if (result.ok) redirect(`/${result.companySlug}/login?restablecida=1`);
  if (result.error === "INVALID_TOKEN") {
    return { formError: null, tokenInvalid: true, fieldErrors: {} };
  }
  return { formError: null, tokenInvalid: false, fieldErrors: result.fieldErrors };
}
