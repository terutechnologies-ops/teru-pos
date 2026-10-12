import Image from "next/image";
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

// Un documento anulado se puede imprimir, pero no debe pasar por válido.
export function VoidedMark({ label = "ANULADA" }: { label?: string }) {
  return (
    <p className="my-[0.5em] border-[3px] border-black py-[0.15em] text-center text-[1.6em] font-extrabold tracking-[0.2em]">
      {label}
    </p>
  );
}

export type ReceiptCompany = {
  name: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
};

// Encabezado de los documentos para el cliente (soporte de venta,
// comprobante de abono): logo y datos de la empresa.
export function CompanyHeader({ company }: { company: ReceiptCompany }) {
  return (
    <header className="flex flex-col items-center text-center">
      {company.logoUrl && (
        // eager: en el marco invisible del POS una imagen diferida nunca
        // carga. unoptimized, como en CompanyMark.
        <Image
          src={company.logoUrl}
          alt={`Logo de ${company.name}`}
          width={200}
          height={200}
          unoptimized
          loading="eager"
          className="mb-[0.6em] h-auto w-[28mm] object-contain grayscale group-data-[paper=58]/sheet:w-[22mm]"
        />
      )}
      <p className="text-[1.5em] leading-tight font-extrabold uppercase">{company.name}</p>
      {company.taxId && <p className="text-[0.95em]">{taxIdText(company.taxId)}</p>}
      {company.address && <p className="text-[0.95em]">{company.address}</p>}
      {company.phone && <p className="text-[0.95em]">Tel. {company.phone}</p>}
    </header>
  );
}

// El NIT es la identificación fiscal habitual; si quien la escribió ya puso
// su tipo ("RUT …", "RFC …"), se respeta.
export function taxIdText(taxId: string) {
  return /^[a-z]/i.test(taxId) ? taxId : `NIT ${taxId}`;
}
