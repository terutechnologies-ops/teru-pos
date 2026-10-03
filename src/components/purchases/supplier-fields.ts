import type { SupplierField } from "@/server/services/third-parties";

// Compartido entre el formulario de proveedores (cliente) y sus acciones
// (servidor).

export type SupplierFormValues = Record<SupplierField, string>;

export type SupplierFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<SupplierField, string>>;
  values: SupplierFormValues;
};

export type SaveSupplierAction = (
  prev: SupplierFormState,
  formData: FormData,
) => Promise<SupplierFormState>;

export function readSupplierForm(formData: FormData): SupplierFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    taxId: field("taxId"),
    phone: field("phone"),
    email: field("email"),
  };
}

// Avisos de la lista por ?aviso=...
export const SUPPLIER_NOTICES = {
  creado: "Proveedor creado.",
  guardado: "Cambios guardados.",
} as const;
