// Tipos de movimiento de caja: cómo se llaman y con qué signo afectan el
// efectivo. Los usan el POS, el panel y el cierre impreso.

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
