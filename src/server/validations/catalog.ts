import { z } from "zod";

// Catálogo de venta.

export const categoryNameSchema = z
  .string()
  .trim()
  // Espacios repetidos cuentan como uno: "Bebidas  frías" = "Bebidas frías".
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, { error: "Escribe el nombre (mínimo 2 caracteres)." })
      .max(60, { error: "El nombre no puede superar 60 caracteres." }),
  );
