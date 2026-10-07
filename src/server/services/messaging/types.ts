export type OutgoingEmail = {
  to: string;
  subject: string;
  // Siempre: los clientes que no muestran HTML usan el texto.
  text: string;
  // Opcional: versión con la marca (ver email-layout.ts).
  html?: string;
};

// Cada proveedor (outbox de desarrollo, Resend, etc.) implementa esta
// interfaz; los servicios de negocio solo dependen de ella.
export interface MessageSender {
  sendEmail(message: OutgoingEmail): Promise<void>;
}
