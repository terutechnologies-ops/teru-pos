import { z } from "zod";

import { quantitySchema } from "@/server/validations/inventory";

// Lo contado de un insumo: >= 0, hasta 3 decimales, en su unidad. Vacío =
// no se cuenta (null). Acepta la coma decimal ("2,5"), que es como se
// escribe a mano en la hoja de conteo.
export const countedQuantitySchema = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .transform((value) => value || null)
  .pipe(quantitySchema.nullable());
