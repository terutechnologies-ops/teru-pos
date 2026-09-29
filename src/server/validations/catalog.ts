import { z } from "zod";

import { currencyDecimals } from "@/lib/company-formats";
import { displayNameSchema } from "@/server/validations/common";

// Catálogo de venta.

export const categoryNameSchema = displayNameSchema(60);

// Tope de Decimal(12, 2).
const MAX_PRICE = 9_999_999_999.99;

// Precio como texto decimal con punto ("16500", "4.5"), que es lo que envía
// un campo numérico. Los decimales dependen de la moneda de la empresa.
// Devuelve el texto normalizado ("4.50") para guardarlo sin pasar por float.
export function priceSchema(currency: string) {
  const decimals = currencyDecimals(currency);
  return z
    .string()
    .trim()
    .refine((value) => value !== "", { error: "Escribe el precio." })
    .refine((value) => /^\d+(\.\d+)?$/.test(value), {
      error: "Escribe un precio válido (solo números, sin signos).",
    })
    .refine((value) => (value.split(".")[1] ?? "").replace(/0+$/, "").length <= decimals, {
      error:
        decimals === 0
          ? "Esta moneda no usa centavos."
          : `Usa máximo ${decimals} decimales.`,
    })
    .refine((value) => Number(value) <= MAX_PRICE, { error: "El precio es demasiado alto." })
    .transform((value) => {
      const [integer, fraction = ""] = value.split(".");
      const digits = fraction.replace(/0+$/, "").padEnd(decimals, "0").slice(0, decimals);
      return decimals > 0 ? `${BigInt(integer)}.${digits}` : `${BigInt(integer)}`;
    });
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
