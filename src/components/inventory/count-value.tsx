import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";

// Diferencia valorizada con signo: faltante en rojo, sobrante con "+".
export function CountValue({
  value,
  currency,
  className,
}: {
  value: string;
  currency: string;
  className?: string;
}) {
  const amount = Number(value);
  return (
    <span className={cn("tabular-nums", amount < 0 && "text-destructive", className)}>
      {amount < 0 ? "−" : amount > 0 ? "+" : ""}
      {formatMoney(Math.abs(amount), currency)}
    </span>
  );
}
