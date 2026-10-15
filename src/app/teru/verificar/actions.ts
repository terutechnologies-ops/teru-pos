"use server";

import { redirect } from "next/navigation";

import { readPlatformSessionToken } from "@/server/http/platform-session";
import { getRequestContext } from "@/server/http/staff-session";
import {
  confirmPlatformEnrollment,
  verifyPlatformMfa,
  type MfaError,
} from "@/server/services/platform/auth";

// Segundo paso del ingreso del equipo Teru: pedir el código y activar la
// verificación. No redirigen: la pantalla muestra el resultado (los códigos
// de respaldo solo existen en esta respuesta).

const ERROR_MESSAGES: Record<MfaError, string> = {
  SESSION_EXPIRED: "Tu ingreso venció. Vuelve a escribir tu contraseña.",
  INVALID_CODE: "Código incorrecto. Usa el código que muestra la app ahora mismo.",
  TOO_MANY_ATTEMPTS: "Demasiados códigos incorrectos. Espera 15 minutos y vuelve a ingresar.",
};

const UNEXPECTED = "No pudimos verificar el código. Inténtalo de nuevo en un momento.";

export type MfaFormState = {
  error: string | null;
  // El ingreso se perdió (venció o se bloqueó): ofrecer volver al login.
  restart: boolean;
};

function failed(error: MfaError) {
  return { error: ERROR_MESSAGES[error], restart: error !== "INVALID_CODE" };
}

export type VerifyFormState = MfaFormState & { done: boolean; recoveryCodesLeft: number | null };

// Con el código de la app va directo al panel; con un código de respaldo
// la pantalla avisa cuántos quedan.
export async function verifyMfaAction(_prev: VerifyFormState, formData: FormData): Promise<VerifyFormState> {
  const recovery = formData.has("recoveryCode");
  let result;
  try {
    result = await verifyPlatformMfa(
      await readPlatformSessionToken(),
      recovery ? { recoveryCode: formData.get("recoveryCode") } : { code: formData.get("code") },
      await getRequestContext(),
    );
  } catch (error) {
    // Sin datos del formulario en el log: es un código de acceso.
    console.error("verifyMfaAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED, restart: false, done: false, recoveryCodesLeft: null };
  }
  if (!result.ok) return { ...failed(result.error), done: false, recoveryCodesLeft: null };
  if (result.recoveryCodesLeft === null) redirect("/teru");
  return { error: null, restart: false, done: true, recoveryCodesLeft: result.recoveryCodesLeft };
}

export type EnrollFormState = MfaFormState & { recoveryCodes: string[] | null };

export async function enrollMfaAction(_prev: EnrollFormState, formData: FormData): Promise<EnrollFormState> {
  try {
    const result = await confirmPlatformEnrollment(
      await readPlatformSessionToken(),
      formData.get("code"),
      await getRequestContext(),
    );
    if (!result.ok) return { ...failed(result.error), recoveryCodes: null };
    return { error: null, restart: false, recoveryCodes: result.recoveryCodes };
  } catch (error) {
    console.error("enrollMfaAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED, restart: false, recoveryCodes: null };
  }
}
