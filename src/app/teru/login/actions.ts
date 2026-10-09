"use server";

import { redirect } from "next/navigation";

import { setPlatformSessionCookie } from "@/server/http/platform-session";
import { getRequestContext } from "@/server/http/staff-session";
import { loginPlatform, type PlatformLoginError } from "@/server/services/platform/auth";

export type PlatformLoginFormState = { error: string | null; email: string };

const ERROR_MESSAGES: Record<PlatformLoginError, string> = {
  INVALID_INPUT: "Revisa el correo y la contraseña.",
  INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
  TOO_MANY_ATTEMPTS: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.",
};

export async function platformLoginAction(
  _prev: PlatformLoginFormState,
  formData: FormData,
): Promise<PlatformLoginFormState> {
  const email = String(formData.get("email") ?? "");
  let result;
  try {
    result = await loginPlatform(
      { email, password: formData.get("password") },
      await getRequestContext(),
    );
  } catch (error) {
    // Sin datos del formulario en el log: podría incluir la contraseña.
    console.error("platformLoginAction: error inesperado", (error as Error).name);
    return { error: "No pudimos iniciar sesión. Inténtalo de nuevo en un momento.", email };
  }
  if (!result.ok) return { error: ERROR_MESSAGES[result.error], email };

  await setPlatformSessionCookie(result.token);
  redirect("/teru");
}
