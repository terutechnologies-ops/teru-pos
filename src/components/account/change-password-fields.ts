import type { PasswordChangeField } from "@/server/services/auth/password-change";

// Compartido entre el formulario de cambio de contraseña (cliente) y su
// acción (servidor). Las contraseñas nunca vuelven al navegador.

export type ChangePasswordFormState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  fieldErrors: Partial<Record<PasswordChangeField, string>>;
  // Cambia en cada cambio exitoso: vuelve a montar el formulario vacío.
  savedCount: number;
};

export const initialChangePasswordState: ChangePasswordFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  savedCount: 0,
};
