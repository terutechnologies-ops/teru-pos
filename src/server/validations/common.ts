import { z } from "zod";

// Validaciones compartidas entre módulos.

// Nombre visible (categoría, producto, bodega, insumo): recorta y cuenta
// los espacios repetidos como uno ("Bebidas  frías" = "Bebidas frías").
export function displayNameSchema(max: number) {
  return z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, { error: "Escribe el nombre (mínimo 2 caracteres)." })
        .max(max, { error: `El nombre no puede superar ${max} caracteres.` }),
    );
}
