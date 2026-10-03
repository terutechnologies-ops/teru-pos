import { formatCalendarDate, formatClock } from "@/lib/company-formats";
import type { PrintableSale } from "@/server/services/sales";

import { ThickRule, VoidedMark } from "./sheet-parts";

// Comanda para cocina: qué preparar, grande y sin precios. Lleva todos los
// productos del pedido, bebidas incluidas (una sola impresora, en caja).
export function KitchenTicket({ printable }: { printable: PrintableSale }) {
  const { sale, dateFormat, timeZone } = printable;
  return (
    <article>
      <p className="bg-black py-[0.4em] text-center text-[1.15em] font-extrabold tracking-[0.12em] text-white">
        COMANDA · COCINA
      </p>
      <h1 className="mt-[0.3em] text-center text-[2.6em] leading-tight font-extrabold group-data-[paper=58]/sheet:text-[1.9em]">
        PEDIDO #{sale.number}
      </h1>
      {sale.voided && <VoidedMark />}

      <div className="mt-[0.3em] flex items-baseline justify-between gap-[0.6em] text-[1.3em]">
        <span className="tabular-nums">{formatClock(sale.createdAt, timeZone)}</span>
        <span className="min-w-0 truncate">Caja: {sale.cashierName}</span>
      </div>
      <p className="text-[0.95em]">
        {formatCalendarDate(sale.createdAt, dateFormat, timeZone)} · {sale.branchName}
      </p>

      <ThickRule />
      <ul className="flex flex-col gap-[0.7em] py-[0.3em]">
        {sale.lines.map((line) => (
          <li key={line.id} className="grid grid-cols-[2.4em_1fr] items-baseline gap-x-[0.4em]">
            <span className="text-[2em] leading-none font-extrabold tabular-nums">
              {line.quantity}
            </span>
            <span className="text-[1.45em] leading-tight font-bold">{line.productName}</span>
            {line.note && (
              <p className="col-start-2 mt-[0.35em] border-[1.5px] border-black px-[0.5em] py-[0.25em] text-[1.1em] font-bold">
                → {line.note}
              </p>
            )}
          </li>
        ))}
      </ul>
      <ThickRule />
      <p className="flex justify-between text-[1.2em] font-bold">
        <span>Total de productos</span>
        <span className="tabular-nums">{sale.itemCount}</span>
      </p>
    </article>
  );
}
