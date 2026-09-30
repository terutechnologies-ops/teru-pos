import { z } from "zod";

import { STOCK_UNITS } from "@/lib/units";
import { quantitySchema } from "@/server/validations/inventory";

// Recetas: cuánto lleva una unidad vendida de cada insumo.

export const recipeLineSchema = z.object({
  quantity: quantitySchema.refine((value) => value !== "0", {
    error: "La cantidad debe ser mayor que cero.",
  }),
  unit: z.enum(STOCK_UNITS, { error: "Elige una unidad." }),
});

export const recipeItemSchema = recipeLineSchema.extend({
  supplyId: z.string().trim().min(1, { error: "Elige un insumo." }),
});

// Lo que llega del formulario: todo texto, sin validar.
export type RecipeItemInput = { [K in keyof z.input<typeof recipeItemSchema>]: string };
export type RecipeLineInput = Omit<RecipeItemInput, "supplyId">;
