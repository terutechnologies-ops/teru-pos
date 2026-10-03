import { formatDateTime } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import type { StockSheet } from "@/server/services/inventory";

import { DashedRule } from "./sheet-parts";

// Línea para firmar a mano bajo la hoja.
function Signature({ label }: { label: string }) {
  return (
    <div className="flex-1 border-t-[1.5px] border-black pt-[0.3em] text-center text-[0.85em]">
      {label}
    </div>
  );
}

// Hoja para contar una bodega a mano: lo que dice el sistema y un espacio
// en blanco para lo contado. "−" = saldo negativo; "—" = sin carga inicial.
export function StockCountSheet({ sheet }: { sheet: StockSheet }) {
  const { dateFormat, timeZone } = sheet;
  const row = "grid grid-cols-[minmax(0,1fr)_auto_5.5em] items-end gap-x-[0.8em]";

  return (
    <article>
      <p className="text-center text-[1.5em] leading-tight font-extrabold uppercase">
        {sheet.companyName}
      </p>
      <p className="mt-[0.4em] bg-black px-[0.4em] py-[0.4em] text-center text-[1.15em] font-extrabold tracking-[0.08em] text-white uppercase">
        Existencias · {sheet.warehouseName}
      </p>
      <p className="mt-[0.5em] text-center text-[0.9em]">
        {formatDateTime(sheet.printedAt, dateFormat, timeZone)} · Imprimió: {sheet.printedBy}
      </p>

      <DashedRule />
      {sheet.supplies.length === 0 ? (
        <p className="py-[1em] text-center">No hay insumos activos para contar.</p>
      ) : (
        <>
          <div className={`${row} border-b-[2px] border-black pb-[0.3em] text-[0.9em] font-bold`}>
            <span>Insumo</span>
            <span className="text-right">Sistema</span>
            <span className="text-right">Contado</span>
          </div>
          <ul>
            {sheet.supplies.map((supply) => (
              <li
                key={supply.id}
                className={`${row} border-b border-dotted border-black py-[0.55em] break-inside-avoid`}
              >
                <span className="min-w-0">
                  {supply.name}
                  {supply.belowMinimum && (
                    <span className="ml-[0.4em] inline-block border-[1.5px] border-black px-[0.3em] text-[0.75em] font-extrabold whitespace-nowrap">
                      BAJO MÍN.
                    </span>
                  )}
                </span>
                <span className="text-right font-bold whitespace-nowrap tabular-nums">
                  {supply.quantity === null
                    ? "—"
                    : formatQuantity(supply.quantity, supply.unit).replace("-", "−")}
                </span>
                {/* Espacio para escribir lo contado. */}
                <span className="h-[1.2em] border-b-[1.5px] border-black" />
              </li>
            ))}
          </ul>
          <p className="mt-[0.8em] text-[0.8em]">
            &quot;−&quot; = saldo negativo (se vendió más de lo registrado). &quot;—&quot; = sin
            carga inicial en esta bodega.
          </p>
        </>
      )}

      <div className="mt-[3.5em] flex gap-[1.5em] break-inside-avoid">
        <Signature label="Contó" />
        <Signature label="Revisó" />
      </div>
    </article>
  );
}
