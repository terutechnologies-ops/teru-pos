import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { CountValue } from "@/components/inventory/count-value";
import type { CountsOverview } from "@/server/services/inventory-counts";

function changedLabel(changed: number) {
  if (changed === 0) return "todo cuadra";
  return changed === 1 ? "1 con diferencia" : `${changed} con diferencia`;
}

// Conteos confirmados del rango, del más reciente al más antiguo, con su
// diferencia valorizada. Toda la fila abre el conteo.
export function CountList({
  overview,
  basePath,
}: {
  overview: CountsOverview;
  basePath: string;
}) {
  const { counts, currency } = overview;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {counts.map((count) => (
        <li key={count.id}>
          <Link
            href={`${basePath}/${count.id}`}
            className="group flex items-center gap-4 px-5 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none sm:px-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold tabular-nums">#{count.number}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {count.confirmedAt}
                </span>
                <span className="truncate font-semibold">· {count.warehouseName}</span>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {count.lineCount === 1 ? "1 insumo contado" : `${count.lineCount} insumos contados`}
                {` · ${changedLabel(count.changedCount)} · Confirmó ${count.confirmedBy}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <CountValue value={count.netValue} currency={currency} className="font-extrabold" />
              {count.missingCostCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {count.missingCostCount === 1 ? "1 sin costo" : `${count.missingCostCount} sin costo`}
                </span>
              )}
            </div>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
