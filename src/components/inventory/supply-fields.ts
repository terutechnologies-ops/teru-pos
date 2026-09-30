import type { SupplyField } from "@/server/services/inventory";

// Compartido entre el formulario de insumos (cliente) y sus acciones
// (servidor).

export type SupplyFormValues = Record<SupplyField, string>;

export type SupplyFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<SupplyField, string>>;
  values: SupplyFormValues;
};

export type SaveSupplyAction = (
  prev: SupplyFormState,
  formData: FormData,
) => Promise<SupplyFormState>;

export function readSupplyForm(formData: FormData): SupplyFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    unit: field("unit"),
    minStock: field("minStock"),
    unitCost: field("unitCost"),
  };
}

// Avisos de la lista por ?aviso=...
export const SUPPLY_NOTICES = {
  creado: "Insumo creado.",
  guardado: "Cambios guardados.",
} as const;
