import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";

// Cuadre de un turno cerrado: cómo se llega al efectivo esperado.
export function CashBreakdown({
  openingAmount,
  cash,
  expectedCash,
  currency,
}: {
  openingAmount: string;
  cash: { sales: string; deposits: string; expenses: string; withdrawals: string };
  expectedCash: string;
  currency: string;
}) {
  const rows = [
    { label: "Fondo inicial", sign: "", value: openingAmount },
    { label: "Efectivo de ventas", sign: "+", value: cash.sales },
    { label: "Ingresos", sign: "+", value: cash.deposits },
    { label: "Gastos", sign: "−", value: cash.expenses },
    { label: "Retiros", sign: "−", value: cash.withdrawals },
  ];
  return (
    <dl className="flex flex-col gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn("tabular-nums", Number(row.value) === 0 && "text-muted-foreground")}>
            {row.sign && `${row.sign} `}
            {formatMoney(Number(row.value), currency)}
          </dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2 font-bold">
        <dt>Efectivo esperado</dt>
        <dd className="tabular-nums">{formatMoney(Number(expectedCash), currency)}</dd>
      </div>
    </dl>
  );
}
