import { z } from "zod";

import { amountSchema, optionalText, voidReasonSchema } from "@/server/validations/common";

// Gasto, retiro o ingreso de efectivo en el turno (ver ADR 0010). El monto
// llega como se ve en el campo (amountSchema).

export const CASH_MOVEMENT_TYPES = ["EXPENSE", "WITHDRAWAL", "DEPOSIT"] as const;

export const CASH_MOVEMENT_NOTE_MAX = 200;

export function cashMovementSchema(currency: string) {
  return z
    .object({
      type: z.enum(CASH_MOVEMENT_TYPES, { error: "Elige si es gasto, retiro o ingreso." }),
      amount: amountSchema(currency, "monto").refine((value) => Number(value) > 0, {
        error: "El monto debe ser mayor que cero.",
      }),
      // Solo cuenta en gastos.
      categoryId: z.string().trim(),
      note: optionalText(
        CASH_MOVEMENT_NOTE_MAX,
        `La nota no puede superar ${CASH_MOVEMENT_NOTE_MAX} caracteres.`,
      ),
    })
    .superRefine((value, ctx) => {
      if (value.type === "EXPENSE" && !value.categoryId) {
        ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Elige la categoría del gasto." });
      }
    })
    .transform((value) => ({
      ...value,
      categoryId: value.type === "EXPENSE" ? value.categoryId : null,
    }));
}

// Lo que llega del formulario: todo texto (el esquema valida el tipo).
export type CashMovementInput = Record<keyof z.input<ReturnType<typeof cashMovementSchema>>, string>;

export const voidCashMovementSchema = z.object({ reason: voidReasonSchema });

export type VoidCashMovementInput = z.input<typeof voidCashMovementSchema>;
