import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatClock, formatDateTime, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { SalesOverview } from "@/server/services/sales";

// Ventas del rango, de la más reciente a la más antigua. Con un solo día
// basta la hora.
export function SaleList({
  overview,
  basePath,
}: {
  overview: SalesOverview;
  basePath: string;
}) {
  const { sales, currency, dateFormat, timeZone, filters } = overview;
  const singleDay = filters.from === filters.to;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {sales.map((sale) => (
        <li key={sale.id}>
          <Link
            href={`${basePath}/${sale.id}`}
            className="group flex items-center gap-4 px-5 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none sm:px-6"
          >
            <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", sale.voided && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold tabular-nums">#{sale.number}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {singleDay
                    ? formatClock(sale.createdAt, timeZone)
                    : formatDateTime(sale.createdAt, dateFormat, timeZone)}
                </span>
                <span className="text-sm text-muted-foreground">
                  · {sale.cashierName}
                  {overview.branches.length > 0 && ` · ${sale.branchName}`}
                </span>
                {sale.voided && <Badge variant="destructive">Anulada</Badge>}
              </div>
              <p className="line-clamp-1 text-sm">{sale.items}</p>
              <p className="text-xs text-muted-foreground">{sale.paymentMethods}</p>
            </div>
            <span
              className={cn(
                "shrink-0 text-right font-extrabold tabular-nums",
                sale.voided && "text-muted-foreground line-through",
              )}
            >
              {formatMoney(Number(sale.total), currency)}
            </span>
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
