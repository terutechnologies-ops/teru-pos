"use server";

import { getRequestContext, requireStaffSession } from "@/server/http/staff-session";
import {
  changeOwnPassword,
  type PasswordChangeResult,
} from "@/server/services/auth/password-change";

import type { ChangePasswordFormState } from "./change-password-fields";

const UNEXPECTED = "No pudimos cambiar la contraseña. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function savedMessage(closedSessions: number) {
  if (closedSessions === 0) return "Contraseña cambiada.";
  return closedSessions === 1
    ? "Contraseña cambiada. Cerramos tu sesión en 1 equipo más."
    : `Contraseña cambiada. Cerramos tu sesión en ${closedSessions} equipos más.`;
}

// Cualquier persona con sesión en la empresa cambia la suya.
export async function changePasswordAction(
  prev: ChangePasswordFormState,
  formData: FormData,
): Promise<ChangePasswordFormState> {
  // requireStaffSession valida la sesión en la empresa enviada.
  const session = await requireStaffSession(field(formData, "company"));

  let result: PasswordChangeResult;
  try {
    result = await changeOwnPassword(
      session,
      {
        currentPassword: field(formData, "currentPassword"),
        password: field(formData, "password"),
        confirmPassword: field(formData, "confirmPassword"),
      },
      await getRequestContext(),
    );
  } catch (error) {
    console.error("changePasswordAction: error inesperado", (error as Error).name);
    return { ...prev, status: "error", message: UNEXPECTED, fieldErrors: {} };
  }

  if (!result.ok) {
    return {
      ...prev,
      status: "error",
      message: result.error ?? null,
      fieldErrors: result.fieldErrors,
    };
  }
  return {
    status: "saved",
    message: savedMessage(result.closedSessions),
    fieldErrors: {},
    savedCount: prev.savedCount + 1,
  };
}
