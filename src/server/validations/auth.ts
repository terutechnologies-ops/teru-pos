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

// Lo que una persona escribe para buscar su empresa ("Su Arepa",
// "/su-arepa/login", "Café Ñandú") llevado a forma de slug. El resultado
// igual se valida con companySlugSchema.
export function toCompanySlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^.*?\/?([^/]+)\/login\/?$/, "$1")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

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

// Reglas de una contraseña nueva (restablecer, invitación y cambio).
const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  .max(200, { error: "La contraseña es demasiado larga." });

export const passwordResetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

// Cambio de la propia contraseña: la actual y la nueva dos veces.
export const passwordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: "Escribe tu contraseña actual." })
      .max(200, { error: "La contraseña es demasiado larga." }),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type PasswordChangeInput = z.input<typeof passwordChangeSchema>;
