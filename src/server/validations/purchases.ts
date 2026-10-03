import { z } from "zod";

import { isCalendarDay } from "@/lib/company-formats";
import { STOCK_UNITS } from "@/lib/units";
import { amountSchema, optionalText, voidReasonSchema } from "@/server/validations/common";
import { quantitySchema } from "@/server/validations/inventory";

// Compras de insumos.

// Encabezado. `today` es el día actual en la zona de la empresa
// ("AAAA-MM-DD"): la compra no puede ser de un día futuro.
export function purchaseHeaderSchema(today: string) {
  return z.object({
    supplierId: z.string().trim().min(1, { error: "Elige el proveedor." }),
    warehouseId: z.string().trim().min(1, { error: "Elige la bodega." }),
    purchasedOn: z
      .string()
      .trim()
      .refine(isCalendarDay, { error: "Escribe una fecha válida." })
      // Mismo formato AAAA-MM-DD: se comparan como texto.
      .refine((day) => day <= today, { error: "La fecha no puede ser futura." }),
    supplierInvoice: optionalText(40, "La factura no puede superar 40 caracteres."),
  });
}

// Línea: cantidad en una unidad de la familia del insumo y lo pagado por
// ella con impuestos.
export function purchaseLineSchema(currency: string) {
  return z.object({
    quantity: quantitySchema.refine((value) => value !== "0", {
      error: "La cantidad debe ser mayor que cero.",
    }),
    unit: z.enum(STOCK_UNITS, { error: "Elige una unidad." }),
    lineTotal: amountSchema(currency, "total pagado"),
  });
}

export function purchaseItemSchema(currency: string) {
  return purchaseLineSchema(currency).extend({
    supplyId: z.string().trim().min(1, { error: "Elige un insumo." }),
  });
}

// Lo que llega del formulario: todo texto, sin validar.
export type PurchaseHeaderFormInput = {
  [K in keyof z.input<ReturnType<typeof purchaseHeaderSchema>>]: string;
};
export type PurchaseItemFormInput = {
  [K in keyof z.input<ReturnType<typeof purchaseItemSchema>>]: string;
};
export type PurchaseLineFormInput = Omit<PurchaseItemFormInput, "supplyId">;

// Anulación de una compra confirmada: el motivo queda en la compra.
export const voidPurchaseSchema = z.object({ reason: voidReasonSchema });

export type VoidPurchaseInput = z.input<typeof voidPurchaseSchema>;
