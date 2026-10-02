import { formatMoney } from "@/lib/company-formats";
import type { SalesOverview } from "@/server/services/sales";

function salesCount(count: number) {
  return count === 1 ? "1 venta" : `${count} ventas`;
}

// Resumen del rango: lo vendido (sin anuladas), cómo se pagó y lo anulado.
// No depende del filtro de estado.
export function SalesSummary({
  summary,
  currency,
}: {
  summary: SalesOverview["summary"];
  currency: string;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);

  return (
    <dl className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Vendido</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">
          {money(summary.completedTotal)}
        </dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {salesCount(summary.completedCount)}
        </dd>
      </div>

      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Por método de pago</dt>
        {summary.byMethod.length > 0 ? (
          <dd className="mt-2">
            <ul className="flex flex-col gap-1 text-sm">
              {summary.byMethod.map((method) => (
                <li key={method.name} className="flex justify-between gap-3">
                  <span className="truncate">{method.name}</span>
                  <span className="font-semibold tabular-nums">{money(method.amount)}</span>
                </li>
              ))}
            </ul>
          </dd>
        ) : (
          <dd className="mt-1 text-2xl font-extrabold">—</dd>
        )}
      </div>

      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Anuladas</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">
          {money(summary.voidedTotal)}
        </dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {salesCount(summary.voidedCount)} · no suman en lo vendido
        </dd>
      </div>
    </dl>
  );
}
