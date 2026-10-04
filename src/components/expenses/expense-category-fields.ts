// Compartido entre la lista de categorías de gasto (cliente) y sus acciones
// (servidor).

export const EXPENSE_CATEGORY_INTENTS = ["up", "down", "activate", "deactivate", "delete"] as const;

export type ExpenseCategoryIntent = (typeof EXPENSE_CATEGORY_INTENTS)[number];
