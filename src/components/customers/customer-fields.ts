import type { CustomerField } from "@/server/services/customers";

// Compartido entre el formulario de clientes (cliente) y sus acciones
// (servidor).

export type CustomerFormValues = Record<CustomerField, string>;

export type CustomerFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<CustomerField, string>>;
  values: CustomerFormValues;
};

export type SaveCustomerAction = (
  prev: CustomerFormState,
  formData: FormData,
) => Promise<CustomerFormState>;

export function readCustomerForm(formData: FormData): CustomerFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    taxId: field("taxId"),
    phone: field("phone"),
    email: field("email"),
    creditLimit: field("creditLimit"),
    creditDays: field("creditDays"),
  };
}

export const EMPTY_CUSTOMER: CustomerFormValues = {
  name: "",
  taxId: "",
  phone: "",
  email: "",
  creditLimit: "0",
  creditDays: "30",
};

// Avisos de la lista por ?aviso=...
export const CUSTOMER_NOTICES = {
  creado: "Cliente creado.",
  guardado: "Cambios guardados.",
} as const;
