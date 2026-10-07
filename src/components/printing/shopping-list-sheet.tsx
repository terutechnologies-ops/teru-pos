import { formatDateTime } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import type { ShoppingListItem, ShoppingListView } from "@/server/services/shopping-list";

import { DashedRule } from "./sheet-parts";

const row = "grid grid-cols-[minmax(0,1fr)_auto_4.5em] items-end gap-x-[0.8em]";

// "−" para el saldo negativo, como la hoja de existencias.
function quantity(value: string, unit: ShoppingListItem["unit"]) {
  return formatQuantity(value, unit).replace("-", "−");
}

function Rows({ title, items, column }: { title: string; items: ShoppingListItem[]; column: string }) {
  return (
    <>
      <div className={`${row} mt-[0.6em] border-b-[2px] border-black pb-[0.3em] text-[0.9em] font-bold`}>
        <span>{title}</span>
        <span className="text-right">{column}</span>
        <span className="text-right">Comprado</span>
      </div>
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            className={`${row} border-b border-dotted border-black py-[0.55em] break-inside-avoid`}
          >
            <span className="min-w-0">
              <span className="block">{item.name}</span>
              <span className="block text-[0.8em]">
                {item.uninitialized
                  ? "Sin carga inicial"
                  : `Quedan ${quantity(item.totalStock, item.unit)}`}
                {item.idealStock !== null && ` · ideal ${quantity(item.idealStock, item.unit)}`}
              </span>
            </span>
            <span className="text-right font-bold whitespace-nowrap tabular-nums">
              {item.toBuy === null ? "" : quantity(item.toBuy, item.unit)}
            </span>
            {/* Espacio para marcar o escribir lo comprado. */}
            <span className="h-[1.2em] border-b-[1.5px] border-black" />
          </li>
        ))}
      </ul>
    </>
  );
}

// Hoja para llevar a comprar: lo sugerido y un espacio para lo comprado.
// Los insumos que alcanzan solo se cuentan; los que no tienen sugerencia van
// aparte con lo que queda, por si también se compran.
export function ShoppingListSheet({ sheet }: { sheet: ShoppingListView }) {
  const { dateFormat, timeZone } = sheet;
  const empty = sheet.toBuy.length === 0 && sheet.noSuggestion.length === 0;

  return (
    <article>
      <p className="text-center text-[1.5em] leading-tight font-extrabold uppercase">
        {sheet.companyName}
      </p>
      <p className="mt-[0.4em] bg-black px-[0.4em] py-[0.4em] text-center text-[1.15em] font-extrabold tracking-[0.08em] text-white uppercase">
        Lista de compras
      </p>
      <p className="mt-[0.5em] text-center text-[0.9em]">
        {formatDateTime(sheet.printedAt, dateFormat, timeZone)} · Imprimió: {sheet.printedBy}
      </p>

      <DashedRule />
      {empty ? (
        <p className="py-[1em] text-center">Nada por comprar.</p>
      ) : (
        <>
          {sheet.toBuy.length > 0 && <Rows title="Por comprar" items={sheet.toBuy} column="Comprar" />}
          {sheet.noSuggestion.length > 0 && (
            <Rows title="Sin sugerencia" items={sheet.noSuggestion} column="" />
          )}
        </>
      )}
      {sheet.enough.length > 0 && (
        <p className="mt-[0.8em] text-[0.85em]">
          {sheet.enough.length === 1
            ? "1 insumo alcanza"
            : `${sheet.enough.length} insumos alcanzan`}{" "}
          (cubren su stock ideal).
        </p>
      )}
      <p className="mt-[0.5em] text-[0.8em]">
        Sumando todas las bodegas. Un saldo negativo (&quot;−&quot;) se cuenta como 0.
      </p>
    </article>
  );
}
