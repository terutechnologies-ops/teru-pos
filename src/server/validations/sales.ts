import { z } from "zod";

import { moneySchema } from "@/server/validations/common";

// Venta del POS. El navegador solo envía qué productos y cuántos, y cómo se
// pagó; precios, recetas y total salen siempre de la base. Los montos llegan
// como texto decimal con punto ("16500", "4.50").

export const SALE_MAX_LINES = 100;
export const SALE_MAX_QUANTITY = 999;
export const SALE_NOTE_MAX = 100;

const lineSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.int().min(1).max(SALE_MAX_QUANTITY, {
    error: `La cantidad máxima por línea es ${SALE_MAX_QUANTITY}.`,
  }),
  note: z
    .string()
    .trim()
    .max(SALE_NOTE_MAX, { error: `La nota no puede superar ${SALE_NOTE_MAX} caracteres.` })
    .nullish()
    .transform((value) => value || null),
});

export function saleSchema(currency: string) {
  const amount = moneySchema(currency, "monto").refine((value) => Number(value) > 0, {
    error: "Cada pago debe ser mayor que cero.",
  });
  const paymentSchema = z.object({
    paymentMethodId: z.string().trim().min(1),
    amount,
    // Solo efectivo: lo que entregó el cliente.
    tendered: moneySchema(currency, "valor recibido").nullish().transform((value) => value ?? null),
  });

  return z.object({
    // La genera el POS por pedido (ver data/sales.ts).
    clientKey: z.uuid({ error: "El pedido no tiene clave. Recarga la página." }),
    lines: z
      .array(lineSchema)
      .min(1, { error: "Agrega al menos un producto." })
      .max(SALE_MAX_LINES, { error: `El pedido no puede tener más de ${SALE_MAX_LINES} líneas.` }),
    payments: z
      .array(paymentSchema)
      .min(1, { error: "Agrega al menos un pago." })
      .refine(
        (payments) =>
          new Set(payments.map((payment) => payment.paymentMethodId)).size === payments.length,
        { error: "Usa cada método de pago una sola vez." },
      ),
  });
}

export type SaleInput = z.input<ReturnType<typeof saleSchema>>;

export const VOID_REASON_MAX = 200;

// Anulación desde el panel: el motivo queda en la venta.
export const voidSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, { error: "Escribe el motivo de la anulación (mínimo 3 caracteres)." })
    .max(VOID_REASON_MAX, {
      error: `El motivo no puede superar ${VOID_REASON_MAX} caracteres.`,
    }),
});

export type VoidSaleInput = z.input<typeof voidSaleSchema>;
