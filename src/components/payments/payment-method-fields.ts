// Compartido entre la lista de métodos de pago (cliente) y sus acciones
// (servidor).

export const PAYMENT_METHOD_INTENTS = ["up", "down", "activate", "deactivate"] as const;

export type PaymentMethodIntent = (typeof PAYMENT_METHOD_INTENTS)[number];
