"use server";

import { getRequestContext } from "@/server/http/staff-session";
import { requestStaffPasswordReset } from "@/server/services/auth/password-reset";

export type RecoverFormState = {
  status: "idle" | "sent" | "error";
  message: string | null;
  email: string;
};

export async function requestResetAction(
  _prev: RecoverFormState,
  formData: FormData,
): Promise<RecoverFormState> {
  const companySlug = String(formData.get("company") ?? "");
  const email = String(formData.get("email") ?? "");
  try {
    const result = await requestStaffPasswordReset(
      companySlug,
      { email },
      await getRequestContext(),
    );
    if (result.ok) return { status: "sent", message: null, email };
    const message =
      result.error === "TOO_MANY_ATTEMPTS"
        ? "Demasiadas solicitudes. Espera 15 minutos e inténtalo de nuevo."
        : result.error === "INVALID_INPUT"
          ? "Ingresa un correo electrónico válido."
          : "Esta empresa no existe o no está activa.";
    return { status: "error", message, email };
  } catch (error) {
    console.error("requestResetAction: error inesperado", (error as Error).name);
    return {
      status: "error",
      message: "No pudimos procesar la solicitud. Inténtalo de nuevo.",
      email,
    };
  }
}
