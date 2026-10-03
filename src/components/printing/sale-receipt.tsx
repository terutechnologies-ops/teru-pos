import Image from "next/image";

import {
  formatCalendarDate,
  formatClock,
  formatDateTime,
  formatMoney,
} from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { PrintableSale } from "@/server/services/sales";

import { DashedRule, SheetRow, ThickRule, VoidedMark, taxIdText } from "./sheet-parts";

// Soporte de venta para el cliente, solo si lo pide. No es una factura
// electrónica y lo dice. En 58 mm la fecha y la hora van en columnas y el
// valor de cada línea baja a la fila de su detalle para dejar ancho al nombre.
export function SaleReceipt({ printable }: { printable: PrintableSale }) {
  const { company, sale, currency, dateFormat, timeZone } = printable;
  const money = (value: string) => formatMoney(Number(value), currency);

  return (
    <article>
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

      <DashedRule />
      <p className="text-center font-bold tracking-[0.08em]">SOPORTE DE VENTA</p>
      {sale.voided && <VoidedMark />}
      <div className="mt-[0.3em]">
        <SheetRow label="Venta" value={<strong>#{sale.number}</strong>} />
        <SheetRow
          label="Fecha"
          value={formatDateTime(sale.createdAt, dateFormat, timeZone)}
          className="group-data-[paper=58]/sheet:hidden"
        />
        <SheetRow
          label={formatCalendarDate(sale.createdAt, dateFormat, timeZone)}
          value={formatClock(sale.createdAt, timeZone)}
          className="hidden group-data-[paper=58]/sheet:flex"
        />
        <SheetRow label="Atendió" value={sale.cashierName} />
      </div>

      <DashedRule />
      <ul className="flex flex-col gap-[0.45em]">
        {sale.lines.map((line) => {
          const detail = [line.quantity > 1 && `${money(line.unitPrice)} c/u`, line.note]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={line.id} className="grid grid-cols-[1fr_auto] gap-x-[0.8em]">
              <span className={cn("font-bold", detail && "group-data-[paper=58]/sheet:col-span-2")}>
                {line.quantity} × {line.productName}
              </span>
              <span
                className={cn(
                  "col-start-2 row-start-1 text-right font-bold tabular-nums",
                  detail && "group-data-[paper=58]/sheet:row-start-2 group-data-[paper=58]/sheet:self-end",
                )}
              >
                {money(line.lineTotal)}
              </span>
              {detail && (
                <span
                  className="col-span-2 pl-[0.6em] text-[0.85em] group-data-[paper=58]/sheet:col-span-1 group-data-[paper=58]/sheet:text-[0.95em]"
                >
                  {detail}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <ThickRule />
      <SheetRow
        label="TOTAL"
        value={money(sale.total)}
        className="text-[2em] leading-tight font-extrabold"
      />

      <DashedRule />
      <div>
        {sale.payments.map((payment) => (
          <div key={payment.id}>
            <SheetRow label={payment.methodName} value={money(payment.amount)} />
            {payment.tendered && (
              <SheetRow
                label="Recibido"
                value={money(payment.tendered)}
                className="pl-[0.6em] text-[0.85em]"
              />
            )}
          </div>
        ))}
        {Number(sale.change) > 0 && (
          <SheetRow label="Cambio" value={money(sale.change)} className="font-bold" />
        )}
      </div>

      <DashedRule />
      <p className="mt-[0.4em] text-center font-bold">¡Gracias por tu compra!</p>
      <p className="mt-[0.4em] text-center text-[0.85em]">
        Este soporte no es una factura electrónica.
      </p>
    </article>
  );
}
