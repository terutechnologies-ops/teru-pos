import type { PurchaseHeaderField, PurchaseItemField } from "@/server/services/purchases";

// Compartido entre los formularios de compras (cliente) y sus acciones
// (servidor).

type FormState<F extends string> = {
  status: "idle" | "saved" | "error";
  message: string | null;
  fieldErrors: Partial<Record<F, string>>;
  values: Record<F, string>;
};

export type PurchaseHeaderValues = Record<PurchaseHeaderField, string>;
export type PurchaseHeaderFormState = FormState<PurchaseHeaderField>;
export type PurchaseHeaderAction = (
  prev: PurchaseHeaderFormState,
  formData: FormData,
) => Promise<PurchaseHeaderFormState>;

export type PurchaseLineValues = Record<PurchaseItemField, string>;
export type PurchaseLineFormState = FormState<PurchaseItemField>;

export function formState<F extends string>(values: Record<F, string>): FormState<F> {
  return { status: "idle", message: null, fieldErrors: {}, values };
}

function reader(formData: FormData) {
  return (name: string) => String(formData.get(name) ?? "");
}

export function readHeaderForm(formData: FormData): PurchaseHeaderValues {
  const field = reader(formData);
  return {
    supplierId: field("supplierId"),
    warehouseId: field("warehouseId"),
    purchasedOn: field("purchasedOn"),
    supplierInvoice: field("supplierInvoice"),
  };
}

export function readLineForm(formData: FormData): PurchaseLineValues {
  const field = reader(formData);
  return {
    supplyId: field("supplyId"),
    quantity: field("quantity"),
    unit: field("unit"),
    lineTotal: field("lineTotal"),
  };
}

// Avisos por ?aviso=... en la lista y en la compra.
export const PURCHASE_LIST_NOTICES = {
  eliminado: "Borrador eliminado.",
} as const;

export const PURCHASE_NOTICES = {
  confirmada:
    "Compra confirmada: sus insumos entraron a la bodega y su costo promedio quedó actualizado.",
} as const;
