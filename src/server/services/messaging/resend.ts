import "server-only";

import type { MessageSender } from "./types";

const RESEND_URL = "https://api.resend.com/emails";
// Un envío colgado no debe retener la función (el reporte corre en after()).
const TIMEOUT_MS = 15_000;

// Resend por su API REST (sin SDK). El error que se lanza nunca incluye la
// clave: queda guardado en el historial del reporte de cierre.
export function createResendSender(
  config: { apiKey: string; from: string },
  fetchImpl: typeof fetch = fetch,
): MessageSender {
  return {
    async sendEmail(message) {
      const response = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html && { html: message.html }),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return;
      let detail = "";
      try {
        const body: unknown = await response.json();
        if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
          detail = body.message.slice(0, 200);
        }
      } catch {
        // Sin cuerpo JSON: basta con el código.
      }
      throw new Error(`Resend rechazó el correo (${response.status})${detail ? `: ${detail}` : ""}`);
    },
  };
}
