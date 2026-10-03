// Hojas impresas y cómo llegar a ellas: comanda y soporte (de una venta) y
// cierre (de un turno de caja).

export type PrintSheet = "comanda" | "soporte" | "cierre";

// auto: la hoja se imprime sola al cargar (la usa printInBackground).
export function printSheetHref(
  companySlug: string,
  sheet: PrintSheet,
  id: string,
  { auto = false } = {},
) {
  return `/${companySlug}/imprimir/${sheet}/${id}${auto ? "?auto=1" : ""}`;
}

// Aviso de la hoja a la pantalla que la abrió en segundo plano.
export const PRINTED_MESSAGE = "teru-pos:impreso";

// Imprime una hoja sin salir de la pantalla: la carga en un marco invisible,
// que se imprime solo y avisa al terminar para quitarlo. Con Chrome en modo
// --kiosk-printing no aparece el diálogo de impresión.
export function printInBackground(href: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });

  const remove = () => {
    window.removeEventListener("message", onMessage);
    frame.remove();
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data === PRINTED_MESSAGE) remove();
  };
  window.addEventListener("message", onMessage);
  // Si la hoja no llega a imprimirse (sin red, sesión vencida), el marco no
  // se queda para siempre. Mientras el diálogo está abierto la pantalla está
  // en pausa, así que esto no lo cierra antes de tiempo.
  window.setTimeout(remove, 120_000);

  frame.src = href;
  document.body.appendChild(frame);
}
