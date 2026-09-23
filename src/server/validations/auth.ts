import { z } from "zod";

// Primeros segmentos de URL que usa la app y no pueden ser slug de empresa.
export const RESERVED_SLUGS = new Set(["api", "dev", "_next"]);

export const companySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64)
  .refine((slug) => !RESERVED_SLUGS.has(slug));

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const staffLoginSchema = z.object({
  email: emailSchema,
  // Sin reglas de complejidad al entrar: esas aplican al crear o cambiar la
  // contraseña. El máximo evita hashear entradas enormes.
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

export type StaffLoginInput = z.input<typeof staffLoginSchema>;

export const PASSWORD_MIN_LENGTH = 8;

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const passwordResetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, {
        error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      })
      .max(200, { error: "La contraseña es demasiado larga." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
