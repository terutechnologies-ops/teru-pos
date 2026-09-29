import type { StockMovementField } from "@/server/services/inventory";

// Compartido entre el formulario de movimientos (cliente) y su acción
// (servidor).

export type MovementFormValues = Record<StockMovementField, string>;

export type MovementFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<StockMovementField, string>>;
  values: MovementFormValues;
};

export function readMovementForm(formData: FormData): MovementFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return { kind: field("kind"), quantity: field("quantity"), reason: field("reason") };
}

// Avisos de la ficha del insumo por ?aviso=...
export const MOVEMENT_NOTICES = {
  movimiento: "Movimiento registrado.",
} as const;
