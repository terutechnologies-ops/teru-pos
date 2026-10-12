import { z } from "zod";

import { amountSchema, optionalText, voidReasonSchema } from "@/server/validations/common";

// Abono de un cliente en el POS. Los montos llegan como se ven en el campo
// ("40.000"); el servidor revisa el saldo, el método y el turno.

export const CUSTOMER_PAYMENT_NOTE_MAX = 200;

export function customerPaymentSchema(currency: string) {
  return z
    .object({
      customerId: z.string().trim().min(1, { error: "Elige el cliente." }).max(64),
      paymentMethodId: z.string().trim().min(1, { error: "Elige cómo paga." }).max(64),
      amount: amountSchema(currency, "monto").refine((value) => Number(value) > 0, {
        error: "El abono debe ser mayor que cero.",
      }),
      // Solo efectivo: lo que entrega el cliente. Vacío = justo.
      tendered: z.union([z.literal(""), amountSchema(currency, "valor recibido")]),
      note: optionalText(
        CUSTOMER_PAYMENT_NOTE_MAX,
        `La nota no puede superar ${CUSTOMER_PAYMENT_NOTE_MAX} caracteres.`,
      ),
    })
    .superRefine((value, ctx) => {
      if (value.tendered && Number(value.tendered) < Number(value.amount)) {
        ctx.addIssue({
          code: "custom",
          path: ["tendered"],
          message: "Lo recibido no alcanza a cubrir el abono.",
        });
      }
    })
    .transform((value) => ({ ...value, tendered: value.tendered || null }));
}

// Lo que llega del POS: todo texto (el esquema valida).
export type CustomerPaymentInput = Record<
  keyof z.input<ReturnType<typeof customerPaymentSchema>>,
  string
>;

export const voidCustomerPaymentSchema = z.object({ reason: voidReasonSchema });

export type VoidCustomerPaymentInput = z.input<typeof voidCustomerPaymentSchema>;
