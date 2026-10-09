import { z } from "zod";

import { emailSchema, newPasswordSchema, staffLoginSchema } from "@/server/validations/auth";

// Cuentas del equipo Teru (panel /teru).

export const platformUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Escribe el nombre (mínimo 2 caracteres)." })
    .max(120, { error: "El nombre no puede superar 120 caracteres." }),
  email: emailSchema,
  password: newPasswordSchema,
});

export type PlatformUserInput = z.input<typeof platformUserSchema>;

export const platformPasswordResetSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

// Mismas reglas que el login del personal, sin "recordar".
export const platformLoginSchema = staffLoginSchema.pick({ email: true, password: true });

// Motivo de desactivar una empresa (queda en la empresa mientras esté
// desactivada).
export const deactivationReasonSchema = z
  .string()
  .trim()
  .min(3, { error: "Escribe el motivo (mínimo 3 caracteres)." })
  .max(200, { error: "El motivo no puede superar 200 caracteres." });
