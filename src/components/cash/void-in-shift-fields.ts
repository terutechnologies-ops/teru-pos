// Compartido entre el formulario de anulación de un registro del turno
// (movimiento de caja o abono de cliente; cliente) y sus acciones
// (servidor).

export type VoidInShiftFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: { reason?: string };
  reason: string;
};

export const initialVoidInShiftState: VoidInShiftFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  reason: "",
};
