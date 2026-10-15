import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { PortfolioSummary as Summary } from "@/server/services/customers";

function customersCount(count: number) {
  return count === 1 ? "1 cliente" : `${count} clientes`;
}

// Resumen de la cartera: lo que te deben y cuánto de eso ya venció. No
// depende de la búsqueda ni de la pestaña.
export function PortfolioSummary({ summary, currency }: { summary: Summary; currency: string }) {
  const money = (value: string) => formatMoney(Number(value), currency);
  const overdue = Number(summary.overdue) > 0;

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Por cobrar</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(summary.receivable)}</dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {customersCount(summary.owingCustomers)} con saldo
        </dd>
      </div>
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Vencido</dt>
        <dd className={cn("mt-1 text-2xl font-extrabold tabular-nums", overdue && "text-destructive")}>
          {money(summary.overdue)}
        </dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {overdue
            ? `${customersCount(summary.overdueCustomers)} con pagos vencidos`
            : "Nadie tiene pagos vencidos"}
        </dd>
      </div>
    </dl>
  );
}
