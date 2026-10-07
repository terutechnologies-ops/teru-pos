import "server-only";

import { devOutboxSender } from "./dev-outbox";
import type { MessageSender } from "./types";

export function isDevOutboxEnabled() {
  return process.env.NODE_ENV === "development";
}

let override: MessageSender | null = null;

// Pruebas: simular un proveedor que falla. null vuelve al normal.
export function setMessageSenderForTesting(sender: MessageSender | null) {
  override = sender;
}

// Aún no hay proveedor real: fuera de desarrollo falla de forma explícita
// en vez de descartar mensajes en silencio.
export function getMessageSender(): MessageSender {
  if (override) return override;
  if (isDevOutboxEnabled()) return devOutboxSender;
  throw new Error("No hay proveedor de mensajes configurado");
}

export type { MessageSender, OutgoingEmail } from "./types";
