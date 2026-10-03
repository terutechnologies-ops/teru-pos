import { formatDateTime, formatMoney } from "@/lib/company-formats";
import type { PrintableShift } from "@/server/services/cash-sessions";

import { DashedRule, SheetRow, ThickRule } from "./sheet-parts";

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-[0.3em] text-[0.85em] font-bold tracking-[0.06em]">{children}</p>;
}

// Línea para firmar a mano bajo la hoja.
function Signature({ label }: { label: string }) {
  return (
    <div className="flex-1 border-t-[1.5px] border-black pt-[0.3em] text-center text-[0.85em]">
      {label}
    </div>
  );
}

// Cierre de turno para entregar la caja: ventas del turno, cuadre del
// efectivo y la diferencia, con espacio para las firmas de quien entrega y
// quien recibe.
export function ShiftClosingSheet({ printable }: { printable: PrintableShift }) {
  const { companyName, shift, currency, dateFormat, timeZone } = printable;
  const money = (value: string) => formatMoney(Number(value), currency);
  const when = (date: Date) => formatDateTime(date, dateFormat, timeZone);
  const difference = Number(shift.difference);
  const outcome = difference < 0 ? "FALTANTE" : difference > 0 ? "SOBRANTE" : "CUADRADA";

  return (
    <article>
      <p className="text-center text-[1.5em] leading-tight font-extrabold uppercase">
        {companyName}
      </p>
      <p className="mt-[0.4em] bg-black py-[0.4em] text-center text-[1.15em] font-extrabold tracking-[0.12em] text-white">
        CIERRE DE TURNO
      </p>

      <div className="mt-[0.6em]">
        <SheetRow label="Cajero" value={<strong>{shift.cashierName}</strong>} />
        <SheetRow label="Sucursal" value={shift.branchName} />
        <SheetRow label="Abierto" value={when(shift.openedAt)} />
        <SheetRow label="Cerrado" value={when(shift.closedAt)} />
        <SheetRow label="Cerró" value={shift.closedByName} />
      </div>

      <DashedRule />
      <SectionLabel>VENTAS</SectionLabel>
      <SheetRow label="Ventas cobradas" value={shift.salesCount} />
      <SheetRow
        label="Anuladas"
        value={
          shift.voidedCount > 0
            ? `${shift.voidedCount} · ${money(shift.voidedTotal)}`
            : "0"
        }
      />
      <div className="mt-[0.4em]">
        {shift.byMethod.map((method) => (
          <SheetRow key={method.name} label={method.name} value={money(method.amount)} />
        ))}
        <SheetRow label="Total vendido" value={money(shift.soldTotal)} className="font-bold" />
      </div>

      <DashedRule />
      <SectionLabel>CUADRE DE EFECTIVO</SectionLabel>
      <SheetRow label="Fondo inicial" value={money(shift.openingAmount)} />
      <SheetRow label="+ Efectivo de ventas" value={money(shift.cashSales)} />
      <SheetRow label="Esperado" value={money(shift.expectedCash)} className="font-bold" />
      <SheetRow label="Contado" value={money(shift.countedCash)} className="font-bold" />

      <ThickRule />
      <SheetRow
        label={outcome}
        value={money(String(Math.abs(difference)))}
        className="text-[1.8em] leading-tight font-extrabold group-data-[paper=58]/sheet:text-[1.4em]"
      />
      {shift.note && <p className="mt-[0.5em] text-[0.9em]">Nota: {shift.note}</p>}

      <div className="mt-[3.5em] flex gap-[1.5em]">
        <Signature label="Entrega" />
        <Signature label="Recibe" />
      </div>
    </article>
  );
}
