import { z } from "zod";

import { STOCK_UNITS } from "@/lib/units";
import { displayNameSchema } from "@/server/validations/common";

// Inventario.

export const warehouseNameSchema = displayNameSchema(60);

// Cantidades: Decimal(14, 3) en la BD.
export const QUANTITY_DECIMALS = 3;
const MAX_QUANTITY = 99_999_999_999.999;

// Cantidad no negativa como texto decimal con punto ("2.5"), que es lo que
// envía un campo numérico. Devuelve el texto normalizado ("2.5", "12") para
// guardarlo sin pasar por float.
export const quantitySchema = z
  .string()
  .trim()
  .refine((value) => value !== "", { error: "Escribe la cantidad." })
  .refine((value) => /^\d+(\.\d+)?$/.test(value), {
    error: "Escribe una cantidad válida (solo números, sin signos).",
  })
  .refine(
    (value) => (value.split(".")[1] ?? "").replace(/0+$/, "").length <= QUANTITY_DECIMALS,
    { error: `Usa máximo ${QUANTITY_DECIMALS} decimales.` },
  )
  .refine((value) => Number(value) <= MAX_QUANTITY, { error: "La cantidad es demasiado alta." })
  .transform((value) => {
    const [integer, fraction = ""] = value.split(".");
    const decimals = fraction.replace(/0+$/, "");
    return decimals ? `${BigInt(integer)}.${decimals}` : `${BigInt(integer)}`;
  });

export const supplySchema = z.object({
  name: displayNameSchema(80),
  unit: z.enum(STOCK_UNITS, { error: "Elige una unidad." }),
  // Vacío = sin mínimo.
  minStock: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(quantitySchema.nullable()),
});

// Lo que llega del formulario: todo texto, sin validar.
export type SupplyInput = { [K in keyof z.input<typeof supplySchema>]: string };
