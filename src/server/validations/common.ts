import { z } from "zod";

import { currencyDecimals } from "@/lib/company-formats";

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

// Tope de Decimal(12, 2), el tipo de los montos (precios, caja, ventas).
const MAX_MONEY = 9_999_999_999.99;

// Monto como texto decimal con punto ("16500", "4.5"), que es lo que envía
// un campo numérico. Los decimales dependen de la moneda de la empresa.
// Devuelve el texto normalizado ("4.50") para guardarlo sin pasar por float.
// `noun` nombra el monto en los mensajes, en masculino singular ("precio",
// "fondo inicial", "conteo").
export function moneySchema(currency: string, noun: string) {
  const decimals = currencyDecimals(currency);
  return z
    .string()
    .trim()
    .refine((value) => value !== "", { error: `Escribe el ${noun}.` })
    .refine((value) => /^\d+(\.\d+)?$/.test(value), {
      error: `Escribe un ${noun} válido (solo números, sin signos).`,
    })
    .refine((value) => (value.split(".")[1] ?? "").replace(/0+$/, "").length <= decimals, {
      error:
        decimals === 0
          ? "Esta moneda no usa centavos."
          : `Usa máximo ${decimals} decimales.`,
    })
    .refine((value) => Number(value) <= MAX_MONEY, {
      error: `El ${noun} es demasiado alto.`,
    })
    .transform((value) => {
      const [integer, fraction = ""] = value.split(".");
      const digits = fraction.replace(/0+$/, "").padEnd(decimals, "0").slice(0, decimals);
      return decimals > 0 ? `${BigInt(integer)}.${digits}` : `${BigInt(integer)}`;
    });
}
