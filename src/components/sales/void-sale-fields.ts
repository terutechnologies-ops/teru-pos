// Compartido entre el formulario de anulación (cliente) y su acción
// (servidor).

export type VoidSaleFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: { reason?: string };
  reason: string;
};

// Avisos del detalle de la venta por ?aviso=...
export const SALE_NOTICES = {
  anulada: "Venta anulada. Su inventario volvió a la bodega y ya no cuenta en el efectivo del turno.",
} as const;
