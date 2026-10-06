import { formatMoney } from "@/lib/company-formats";
import type { CashMovementsOverview } from "@/server/services/cash-movements";

function count(value: number, one: string, many: string) {
  return value === 1 ? `1 ${one}` : `${value} ${many}`;
}

// Resumen del rango: gastos por categoría, y retiros e ingresos aparte (no
// son gasto). Sin anulados. No depende del filtro "Mostrar".
export function CashMovementSummary({
  summary,
  currency,
}: {
  summary: CashMovementsOverview["summary"];
  currency: string;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);
  const { expenses, withdrawals, deposits } = summary;
  const expenseTotal = Number(expenses.total);

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Gastos</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(expenses.total)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {count(expenses.count, "gasto", "gastos")} pagados con efectivo de la caja
          </dd>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Retiros</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(withdrawals.total)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {count(withdrawals.count, "retiro", "retiros")} · no son gasto
          </dd>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Ingresos</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(deposits.total)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {count(deposits.count, "ingreso", "ingresos")} · no son venta
          </dd>
        </div>
      </dl>

      {expenses.byCategory.length > 0 && (
        <section
          aria-labelledby="gastos-por-categoria"
          className="rounded-xl bg-card p-5 shadow-sm sm:p-6"
        >
          <h3 id="gastos-por-categoria" className="text-sm font-bold">
            Gastos por categoría
          </h3>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {expenses.byCategory.map((category) => {
              const share = expenseTotal > 0 ? (Number(category.amount) / expenseTotal) * 100 : 0;
              return (
                <li key={category.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {category.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {count(category.count, "gasto", "gastos")}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold">{money(category.amount)}</span>
                      <span className="text-muted-foreground"> · {Math.round(share)} %</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {summary.voidedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {count(summary.voidedCount, "movimiento anulado", "movimientos anulados")} por{" "}
          {money(summary.voidedTotal)}: no suman en ningún total.
        </p>
      )}
    </div>
  );
}
