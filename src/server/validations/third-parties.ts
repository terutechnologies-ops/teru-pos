import { z } from "zod";

import { emailSchema } from "@/server/validations/auth";
import { displayNameSchema } from "@/server/validations/common";

// Texto opcional: vacío o solo espacios se guarda como null.
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, { error: tooLong })
    .transform((value) => value || null);
}

// Proveedor (tercero con el papel de proveedor).
export const supplierSchema = z.object({
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
});

export type SupplierInput = z.input<typeof supplierSchema>;
export type SupplierData = z.output<typeof supplierSchema>;
