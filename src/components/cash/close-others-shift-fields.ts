// Compartido entre el formulario de cierre desde el panel (cliente) y su
// acción (servidor).

export type CloseOthersShiftFormValues = { countedCash: string; closingNote: string };

export type CloseOthersShiftFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<keyof CloseOthersShiftFormValues, string>>;
  values: CloseOthersShiftFormValues;
};

// Avisos del detalle del turno por ?aviso=...
export const CASH_NOTICES = {
  cerrado: "Turno cerrado. Sus ventas ya no se pueden anular.",
  "movimiento-anulado": "Movimiento anulado. Ya no cuenta en el efectivo esperado del turno.",
} as const;
