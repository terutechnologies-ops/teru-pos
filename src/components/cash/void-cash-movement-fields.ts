// Compartido entre el formulario de anulación de un movimiento de caja
// (cliente) y su acción (servidor).

export type VoidCashMovementFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: { reason?: string };
  reason: string;
};
