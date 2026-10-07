import "server-only";

import { getMailConfig } from "@/server/env";

import { devOutboxSender } from "./dev-outbox";
import { createResendSender } from "./resend";
import type { MessageSender } from "./types";

export function isDevOutboxEnabled() {
  return process.env.NODE_ENV === "development";
}

let override: MessageSender | null = null;

// Pruebas: simular un proveedor que falla. null vuelve al normal.
export function setMessageSenderForTesting(sender: MessageSender | null) {
  override = sender;
}

// Con RESEND_API_KEY, Resend (también en desarrollo: sirve para probar el
// envío real). Sin ella, el outbox en desarrollo; fuera de desarrollo falla
// de forma explícita en vez de descartar mensajes en silencio.
export function getMessageSender(): MessageSender {
  if (override) return override;
  const mail = getMailConfig();
  if (mail) return createResendSender(mail);
  if (isDevOutboxEnabled()) return devOutboxSender;
  throw new Error("No hay proveedor de mensajes configurado");
}

export type { MessageSender, OutgoingEmail } from "./types";
