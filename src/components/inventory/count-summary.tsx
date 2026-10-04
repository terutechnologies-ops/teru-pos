import type { ReactNode } from "react";

import { CountValue } from "@/components/inventory/count-value";
import type { CountDetail } from "@/server/services/inventory-counts";

function Tile({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-5 shadow-sm">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tabular-nums">{children}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

// Resumen de un conteo confirmado: cuánto se contó y lo que faltó o sobró,
// valorizado al costo de cada insumo al confirmar.
export function CountSummary({
  lines,
  totals,
  currency,
}: {
  lines: CountDetail["lines"];
  totals: NonNullable<CountDetail["totals"]>;
  currency: string;
}) {
  const changed = lines.filter((line) => Number(line.difference) !== 0).length;

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Insumos contados"
          note={
            changed === 0 ? "Todo cuadra" : changed === 1 ? "1 con diferencia" : `${changed} con diferencia`
          }
        >
          {lines.length}
        </Tile>
        <Tile label="Faltante" note="Salió del inventario">
          <CountValue value={totals.shortage} currency={currency} />
        </Tile>
        <Tile label="Sobrante" note="Entró al inventario">
          <CountValue value={totals.surplus} currency={currency} />
        </Tile>
        <Tile label="Neto" note="Sobrante menos faltante">
          <CountValue value={totals.net} currency={currency} />
        </Tile>
      </dl>
      {totals.missingCost > 0 && (
        <p className="text-xs text-muted-foreground">
          {totals.missingCost === 1
            ? "1 insumo con diferencia no tiene costo: no entra en los totales."
            : `${totals.missingCost} insumos con diferencia no tienen costo: no entran en los totales.`}
        </p>
      )}
    </div>
  );
}
