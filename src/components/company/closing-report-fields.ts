// Compartido entre la tarjeta del reporte de cierre (cliente) y su acción
// (servidor).

export type ClosingReportFormState = {
  status: "idle" | "error" | "saved";
  message: string | null;
  // Lo escrito (con error) o la lista guardada, separada por comas.
  value: string;
};

export function emailsToText(emails: string[]) {
  return emails.join(", ");
}
