"use server";

import { redirect } from "next/navigation";

import {
  getRequestContext,
  setStaffSessionCookie,
} from "@/server/http/staff-session";
import {
  loginStaff,
  type StaffLoginError,
} from "@/server/services/auth/staff-auth";

export type LoginFormState = { error: string | null; email: string };

const ERROR_MESSAGES: Record<StaffLoginError, string> = {
  INVALID_INPUT: "Revisa el correo y la contraseña.",
  INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
  TOO_MANY_ATTEMPTS:
    "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.",
  COMPANY_NOT_FOUND: "Esta empresa no existe o no está activa.",
};

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  // Viene del cliente como cualquier otro campo: loginStaff lo valida contra
  // las empresas activas.
  const companySlug = String(formData.get("company") ?? "");
  const email = String(formData.get("email") ?? "");
  let result;
  try {
    result = await loginStaff(
      companySlug,
      {
        email,
        password: formData.get("password"),
        remember: formData.get("remember") === "on",
      },
      await getRequestContext(),
    );
  } catch (error) {
    // Sin datos del formulario en el log: podría incluir la contraseña.
    console.error("loginAction: error inesperado", (error as Error).name);
    return {
      error: "No pudimos iniciar sesión. Inténtalo de nuevo en un momento.",
      email,
    };
  }

  if (!result.ok) return { error: ERROR_MESSAGES[result.error], email };

  await setStaffSessionCookie({
    companySlug: result.companySlug,
    token: result.token,
    persistent: result.persistent,
    expiresAt: result.expiresAt,
  });
  redirect(`/${result.companySlug}`);
}
