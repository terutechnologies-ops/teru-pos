import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatClock, formatDateTime, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { CashMovementsOverview } from "@/server/services/cash-movements";

import { CASH_MOVEMENT_KINDS } from "./cash-movement-kinds";

// Movimientos del rango, del más reciente al más antiguo, con su cajero y
// enlace a su turno (donde se anulan). Con un solo día basta la hora.
export function CashMovementLedger({
  overview,
  companySlug,
}: {
  overview: CashMovementsOverview;
  companySlug: string;
}) {
  const { movements, currency, dateFormat, timeZone, filters } = overview;
  const singleDay = filters.from === filters.to;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {movements.map((movement) => {
        const kind = CASH_MOVEMENT_KINDS[movement.type];
        return (
          <li key={movement.id} className="flex items-start gap-4 px-5 py-4 sm:px-6">
            <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", movement.voided && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {singleDay
                    ? formatClock(movement.createdAt, timeZone)
                    : formatDateTime(movement.createdAt, dateFormat, timeZone)}
                </span>
                <span className="font-bold">{kind.label}</span>
                {movement.categoryName && (
                  <span className="truncate text-sm">· {movement.categoryName}</span>
                )}
                {movement.voided && <Badge variant="destructive">Anulado</Badge>}
              </div>
              {movement.note && (
                <p className="text-sm break-words text-muted-foreground">{movement.note}</p>
              )}
              {movement.voided && (
                <p className="text-xs text-muted-foreground">
                  Lo anuló {movement.voided.byName}: {movement.voided.reason}
                </p>
              )}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  {movement.cashierName}
                  {overview.branches.length > 0 && ` · ${movement.branchName}`}
                </span>
                <Link
                  href={`/${companySlug}/caja/${movement.cashSessionId}`}
                  className="font-semibold text-link hover:underline"
                >
                  Ver turno
                </Link>
                {movement.hasReceipt && (
                  <a
                    href={`/${companySlug}/recibos/${movement.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 font-semibold text-link hover:underline"
                  >
                    <ReceiptText className="size-4" aria-hidden />
                    Ver recibo
                  </a>
                )}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 font-extrabold tabular-nums",
                movement.voided && "text-muted-foreground line-through",
              )}
            >
              {kind.sign}
              {formatMoney(Number(movement.amount), currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
