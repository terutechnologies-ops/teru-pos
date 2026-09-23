export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
};

// Cada proveedor (outbox de desarrollo, Resend, etc.) implementa esta
// interfaz; los servicios de negocio solo dependen de ella.
export interface MessageSender {
  sendEmail(message: OutgoingEmail): Promise<void>;
}
