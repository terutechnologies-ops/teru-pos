import { z } from "zod";

import { amountSchema, displayNameSchema } from "@/server/validations/common";

// Catálogo de venta.

export const categoryNameSchema = displayNameSchema(60);

// Precio final al público, como se escribe en el campo: punto de miles y
// coma decimal ("16.500", "4,50"); también sin separadores (ver
// amountSchema).
export function priceSchema(currency: string) {
  return amountSchema(currency, "precio");
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .transform((value) => value || null);

export function productSchema(currency: string) {
  return z.object({
    name: displayNameSchema(80),
    categoryId: z.string().trim().min(1, { error: "Elige una categoría." }),
    description: optionalText(200, "La descripción no puede superar 200 caracteres."),
    price: priceSchema(currency),
  });
}

export type ProductInput = z.input<ReturnType<typeof productSchema>>;
