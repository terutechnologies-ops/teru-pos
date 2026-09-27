import { z } from "zod";

import { isInvitableRole } from "@/lib/staff-roles";
import { emailSchema } from "@/server/validations/auth";

// Paso "Equipo" del asistente: invitar a un miembro del personal.
export const staffInvitationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Escribe el nombre (mínimo 2 caracteres)." })
    .max(120, { error: "El nombre no puede superar 120 caracteres." }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => emailSchema.safeParse(value).success, {
      error: "Escribe un correo válido.",
    }),
  role: z.string().refine(isInvitableRole, { error: "Elige un rol." }),
});

export type StaffInvitationInput = z.input<typeof staffInvitationSchema>;
