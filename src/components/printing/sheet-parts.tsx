import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Piezas comunes de las hojas impresas. Solo negro sobre blanco: las
// impresoras térmicas no tienen grises y el texto fino se pierde.

export function DashedRule() {
  return <hr className="my-[0.6em] border-0 border-t-[1.5px] border-dashed border-black" />;
}

export function ThickRule() {
  return <hr className="my-[0.6em] border-0 border-t-[3px] border-solid border-black" />;
}

// Etiqueta a la izquierda y valor a la derecha. Si no caben en una línea
// (montos grandes en 58 mm), el valor baja y queda a la derecha: nunca se
// sale del papel.
export function SheetRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-[0.8em]", className)}>
      <span>{label}</span>
      <span className="ml-auto text-right tabular-nums">{value}</span>
    </div>
  );
}

// Una venta anulada se puede imprimir, pero no debe pasar por válida.
export function VoidedMark() {
  return (
    <p className="my-[0.5em] border-[3px] border-black py-[0.15em] text-center text-[1.6em] font-extrabold tracking-[0.2em]">
      ANULADA
    </p>
  );
}

// El NIT es la identificación fiscal habitual; si quien la escribió ya puso
// su tipo ("RUT …", "RFC …"), se respeta.
export function taxIdText(taxId: string) {
  return /^[a-z]/i.test(taxId) ? taxId : `NIT ${taxId}`;
}
