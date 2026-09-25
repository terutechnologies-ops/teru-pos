import { z } from "zod";

import { isCurrencyCode, isDateFormat } from "@/lib/company-formats";
import { companySlugSchema, emailSchema } from "@/server/validations/auth";

const nameSchema = z.string().trim().min(2).max(120);

// Alta de empresa por script de soporte (no hay registro público).
export const createCompanySchema = z.object({
  name: nameSchema,
  slug: companySlugSchema,
  ownerName: nameSchema,
  ownerEmail: emailSchema,
});

export type CreateCompanyInput = z.input<typeof createCompanySchema>;

// Texto opcional: vacío o solo espacios se guarda como null.
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, { error: tooLong })
    .transform((value) => value || null);
}

// Paso "Negocio" del asistente de configuración.
export const companyProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Escribe el nombre del negocio (mínimo 2 caracteres)." })
    .max(120, { error: "El nombre no puede superar 120 caracteres." }),
  taxId: optionalText(30, "La identificación no puede superar 30 caracteres."),
  phone: optionalText(30, "El teléfono no puede superar 30 caracteres."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => !value || emailSchema.safeParse(value).success, {
      error: "Escribe un correo válido.",
    })
    .transform((value) => value || null),
  address: optionalText(200, "La dirección no puede superar 200 caracteres."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCurrencyCode, { error: "Elige una moneda válida." }),
  dateFormat: z.string().refine(isDateFormat, {
    error: "Elige un formato de fecha válido.",
  }),
});

export type CompanyProfileInput = z.input<typeof companyProfileSchema>;
