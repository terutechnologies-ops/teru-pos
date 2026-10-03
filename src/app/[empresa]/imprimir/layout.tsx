// Hojas para imprimir en la impresora de la caja: blancas y sin menú. Sin
// márgenes de página: el ancho lo da el rollo (80 o 58 mm). El fondo de la
// app se fuerza a blanco: en térmica un gris claro puede salir punteado.
const PRINT_CSS = "@page { margin: 0; } @media print { html, body { background: #fff; } }";

export default function PrintLayout({ children }: LayoutProps<"/[empresa]/imprimir">) {
  return (
    <div className="min-h-svh bg-muted print:min-h-0 print:bg-white">
      <style>{PRINT_CSS}</style>
      {children}
    </div>
  );
}
