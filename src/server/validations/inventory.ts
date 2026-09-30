import { z } from "zod";

import { STOCK_UNITS } from "@/lib/units";
import { displayNameSchema } from "@/server/validations/common";

// Inventario.

export const warehouseNameSchema = displayNameSchema(60);

// Número no negativo como texto decimal con punto ("2.5"), que es lo que
// envía un campo numérico. Devuelve el texto normalizado ("2.5", "12") para
// guardarlo sin pasar por float.
function decimalTextSchema(options: {
  decimals: number;
  max: number;
  empty: string;
  invalid: string;
  tooHigh: string;
}) {
  const { decimals, max } = options;
  return z
    .string()
    .trim()
    .refine((value) => value !== "", { error: options.empty })
    .refine((value) => /^\d+(\.\d+)?$/.test(value), { error: options.invalid })
    .refine((value) => (value.split(".")[1] ?? "").replace(/0+$/, "").length <= decimals, {
      error: `Usa máximo ${decimals} decimales.`,
    })
    .refine((value) => Number(value) <= max, { error: options.tooHigh })
    .transform((value) => {
      const [integer, fraction = ""] = value.split(".");
      const digits = fraction.replace(/0+$/, "");
      return digits ? `${BigInt(integer)}.${digits}` : `${BigInt(integer)}`;
    });
}

// Cantidades: Decimal(14, 3) en la BD.
export const QUANTITY_DECIMALS = 3;

export const quantitySchema = decimalTextSchema({
  decimals: QUANTITY_DECIMALS,
  max: 99_999_999_999.999,
  empty: "Escribe la cantidad.",
  invalid: "Escribe una cantidad válida (solo números, sin signos).",
  tooHigh: "La cantidad es demasiado alta.",
});

// Costo de referencia por unidad del insumo: Decimal(14, 4) en la BD.
// Cuatro decimales en cualquier moneda: un gramo puede costar 3,25 pesos.
export const UNIT_COST_DECIMALS = 4;

export const unitCostSchema = decimalTextSchema({
  decimals: UNIT_COST_DECIMALS,
  max: 9_999_999_999.9999,
  empty: "Escribe el costo.",
  invalid: "Escribe un costo válido (solo números, sin signos).",
  tooHigh: "El costo es demasiado alto.",
});

// Vacío = null (campo opcional).
const optional = <T extends z.ZodType<string, string>>(schema: T) =>
  z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(schema.nullable());

export const supplySchema = z.object({
  name: displayNameSchema(80),
  unit: z.enum(STOCK_UNITS, { error: "Elige una unidad." }),
  // Vacío = sin mínimo.
  minStock: optional(quantitySchema),
  // Vacío = sin costo.
  unitCost: optional(unitCostSchema),
});

// Lo que llega del formulario: todo texto, sin validar.
export type SupplyInput = { [K in keyof z.input<typeof supplySchema>]: string };

// Movimientos que registra una persona: la carga inicial de una bodega y los
// ajustes (entrada o salida). El servicio les pone el signo.
export const MOVEMENT_KINDS = ["INITIAL", "IN", "OUT"] as const;

export type MovementKind = (typeof MOVEMENT_KINDS)[number];

const REASON_MAX = 200;

export const stockMovementSchema = z
  .object({
    kind: z.enum(MOVEMENT_KINDS, { error: "Elige si es una entrada o una salida." }),
    quantity: quantitySchema.refine((value) => value !== "0", {
      error: "La cantidad debe ser mayor que cero.",
    }),
    // Vacío = sin motivo (solo en la carga inicial).
    reason: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, " "))
      .pipe(
        z.string().max(REASON_MAX, { error: `El motivo no puede superar ${REASON_MAX} caracteres.` }),
      ),
  })
  // El ajuste cambia un saldo ya cargado: el motivo es su explicación.
  .superRefine((value, ctx) => {
    if (value.kind !== "INITIAL" && value.reason.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Escribe el motivo del ajuste (mínimo 3 caracteres).",
      });
    }
  })
  .transform((value) => ({ ...value, reason: value.reason || null }));

export type StockMovementFormInput = {
  [K in keyof z.input<typeof stockMovementSchema>]: string;
};
