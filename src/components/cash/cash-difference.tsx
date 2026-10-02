import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";

// Diferencia de un cierre (contado − esperado): faltante, sobrante o
// cuadrada.
export function differenceLabel(difference: string, currency: string) {
  const value = Number(difference);
  if (value < 0) return `Faltante ${formatMoney(-value, currency)}`;
  if (value > 0) return `Sobrante ${formatMoney(value, currency)}`;
  return "Cuadrada";
}

export function CashDifference({
  difference,
  currency,
  className,
}: {
  difference: string;
  currency: string;
  className?: string;
}) {
  const value = Number(difference);
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value < 0 ? "text-destructive" : value > 0 ? "text-foreground" : "text-success",
        className,
      )}
    >
      {differenceLabel(difference, currency)}
    </span>
  );
}
