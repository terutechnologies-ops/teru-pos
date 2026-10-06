import type { CashMovementField } from "@/server/services/cash-movements";

// Compartido entre el formulario de movimientos de caja (cliente) y su
// acción (servidor).

export type CashMovementFormValues = Partial<Record<Exclude<CashMovementField, "image">, string>>;

export type CashMovementFormState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  fieldErrors: Partial<Record<CashMovementField, string>>;
  // Lo escrito, para no perderlo si hubo error.
  values: CashMovementFormValues;
  // Hubo foto y el formulario volvió con error: el navegador la descarta.
  imageDropped: boolean;
  // Cambia en cada registro: vuelve a montar el formulario vacío.
  savedCount: number;
};

export const initialCashMovementState: CashMovementFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: {},
  imageDropped: false,
  savedCount: 0,
};
