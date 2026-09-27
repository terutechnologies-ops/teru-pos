// Compartido entre los formularios de categorías (cliente) y sus acciones
// (servidor).

export type CategoryFormState = {
  status: "idle" | "saved" | "error";
  error: string | null;
  // Lo escrito, para no perderlo si hubo error.
  name: string;
};

export const CATEGORY_INTENTS = ["up", "down", "activate", "deactivate", "delete"] as const;

export type CategoryIntent = (typeof CATEGORY_INTENTS)[number];

export type CategoryRowState = { error: string | null };
