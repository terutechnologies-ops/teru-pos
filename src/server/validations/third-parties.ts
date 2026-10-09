import { z } from "zod";

import { emailSchema } from "@/server/validations/auth";
import { amountSchema, displayNameSchema, optionalText } from "@/server/validations/common";

// Datos de contacto de un tercero (proveedor o cliente).
const contactFields = {
  name: displayNameSchema(80),
  taxId: optionalText(30, "El NIT no puede superar 30 caracteres."),
  phone: optionalText(30, "El teléfono no puede superar 30 caracteres."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => !value || emailSchema.safeParse(value).success, {
      error: "Escribe un correo válido.",
    })
    .transform((value) => value || null),
};

// Proveedor (tercero con el papel de proveedor).
export const supplierSchema = z.object(contactFields);

export type SupplierInput = z.input<typeof supplierSchema>;
export type SupplierData = z.output<typeof supplierSchema>;

export const CREDIT_DAYS_MAX = 365;

// Cliente de crédito: contacto (el correo recibe el registro de cada compra
// a crédito), cupo (0 = sin crédito) y plazo en días.
export function customerSchema(currency: string) {
  return z.object({
    ...contactFields,
    creditLimit: amountSchema(currency, "cupo"),
    creditDays: z
      .string()
      .trim()
      .refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= CREDIT_DAYS_MAX, {
        error: `Escribe el plazo en días (de 0 a ${CREDIT_DAYS_MAX}).`,
      })
      .transform(Number),
  });
}

export type CustomerInput = z.input<ReturnType<typeof customerSchema>>;
export type CustomerData = z.output<ReturnType<typeof customerSchema>>;
