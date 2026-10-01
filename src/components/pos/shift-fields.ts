import type { ShiftField } from "@/server/services/cash-sessions";

// Compartido entre los formularios del turno (cliente) y sus acciones
// (servidor).

export type ShiftFormValues = Partial<Record<ShiftField, string>>;

export type ShiftFormState = {
  error: string | null;
  fieldErrors: Partial<Record<ShiftField, string>>;
  // Lo escrito, para no perderlo si hubo error.
  values: ShiftFormValues;
};

export const initialShiftState: ShiftFormState = { error: null, fieldErrors: {}, values: {} };
