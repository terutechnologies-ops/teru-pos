import { formatMoney } from "@/lib/company-formats";
import type { PurchasesOverview } from "@/server/services/purchases";

function purchasesCount(count: number) {
  return count === 1 ? "1 compra" : `${count} compras`;
}

// Resumen del rango: lo comprado (sin anuladas) y lo anulado. No depende
// del filtro de estado.
export function PurchasesSummary({
  summary,
  currency,
}: {
  summary: PurchasesOverview["summary"];
  currency: string;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Comprado</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">
          {money(summary.confirmedTotal)}
        </dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {purchasesCount(summary.confirmedCount)}
        </dd>
      </div>

      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Anuladas</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">
          {money(summary.voidedTotal)}
        </dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {purchasesCount(summary.voidedCount)} · no suman en lo comprado
        </dd>
      </div>
    </dl>
  );
}
