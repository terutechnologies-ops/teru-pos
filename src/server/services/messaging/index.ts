import "server-only";

import { devOutboxSender } from "./dev-outbox";
import type { MessageSender } from "./types";

export function isDevOutboxEnabled() {
  return process.env.NODE_ENV === "development";
}

// Aún no hay proveedor real: fuera de desarrollo falla de forma explícita
// en vez de descartar mensajes en silencio.
export function getMessageSender(): MessageSender {
  if (isDevOutboxEnabled()) return devOutboxSender;
  throw new Error("No hay proveedor de mensajes configurado");
}

export type { MessageSender, OutgoingEmail } from "./types";
