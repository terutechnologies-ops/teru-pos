// Compartido entre los formularios de categorías (cliente) y sus acciones
// (servidor).

export const CATEGORY_INTENTS = ["up", "down", "activate", "deactivate", "delete"] as const;

export type CategoryIntent = (typeof CATEGORY_INTENTS)[number];
