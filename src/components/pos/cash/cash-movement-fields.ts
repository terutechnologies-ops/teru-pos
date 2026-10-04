import type { CashMovementField } from "@/server/services/cash-movements";

// Compartido entre el formulario de movimientos de caja (cliente) y su
// acción (servidor).

export type CashMovementKind = "EXPENSE" | "WITHDRAWAL" | "DEPOSIT";

export const CASH_MOVEMENT_KINDS: Record<
  CashMovementKind,
  { label: string; help: string; submit: string; sign: "−" | "+" }
> = {
  EXPENSE: {
    label: "Gasto",
    help: "Pagaste algo del negocio con efectivo de la caja.",
    submit: "Registrar gasto",
    sign: "−",
  },
  WITHDRAWAL: {
    label: "Retiro",
    help: "Sacaste efectivo sin gastarlo, p. ej. a la caja fuerte.",
    submit: "Registrar retiro",
    sign: "−",
  },
  DEPOSIT: {
    label: "Ingreso",
    help: "Agregaste efectivo que no es una venta, p. ej. sencillo.",
    submit: "Registrar ingreso",
    sign: "+",
  },
};

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
