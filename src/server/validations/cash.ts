import { z } from "zod";

import { parseAmountInput } from "@/lib/company-formats";
import { moneySchema } from "@/server/validations/common";

// Turnos de caja. Los montos llegan como se ven en el campo ("200.000",
// formatAmountInput) o sin separadores ("200000", sin JS).

function amountSchema(currency: string, noun: string) {
  return z.string().transform(parseAmountInput).pipe(moneySchema(currency, noun));
}

const NOTE_MAX = 200;

export function openShiftSchema(currency: string) {
  return z.object({
    // Vacío = la única sucursal activa (el servicio lo resuelve).
    branchId: z.string().trim(),
    openingAmount: amountSchema(currency, "fondo inicial"),
  });
}

export type OpenShiftInput = z.input<ReturnType<typeof openShiftSchema>>;

export function closeShiftSchema(currency: string) {
  return z.object({
    countedCash: amountSchema(currency, "conteo"),
    closingNote: z
      .string()
      .trim()
      .max(NOTE_MAX, { error: `La nota no puede superar ${NOTE_MAX} caracteres.` })
      .transform((value) => value || null),
  });
}

export type CloseShiftInput = z.input<ReturnType<typeof closeShiftSchema>>;
