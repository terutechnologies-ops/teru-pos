import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatMoney, type DateFormat } from "@/lib/company-formats";
import type { ReviewShift } from "@/server/services/cash-sessions";

import { CashDifference } from "./cash-difference";

function salesCount(count: number) {
  return count === 1 ? "1 venta" : `${count} ventas`;
}

// Turnos de caja (abiertos o cerrados) con enlace a su detalle. Abiertos:
// desde cuándo y, si viene de un día anterior, la insignia. Cerrados: el
// cuadre.
export function ShiftReviewList({
  shifts,
  basePath,
  currency,
  dateFormat,
  timeZone,
  showBranch,
}: {
  shifts: (ReviewShift & { stale?: boolean })[];
  basePath: string;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  showBranch: boolean;
}) {
  const when = (date: Date) => formatDateTime(date, dateFormat, timeZone);
  const money = (value: string) => formatMoney(Number(value), currency);

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {shifts.map((shift) => (
        <li key={shift.id}>
          <Link
            href={`${basePath}/${shift.id}`}
            className="group flex items-center gap-4 px-5 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none sm:px-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold">{shift.cashierName}</span>
                {showBranch && (
                  <span className="text-sm text-muted-foreground">· {shift.branchName}</span>
                )}
                {shift.stale && <Badge variant="destructive">De un día anterior</Badge>}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                {shift.closed
                  ? `${when(shift.openedAt)} → ${when(shift.closed.at)}`
                  : `Abierto desde ${when(shift.openedAt)}`}
                {" · "}
                {salesCount(shift.salesCount)}
              </p>
              {shift.closed?.byOtherName && (
                <p className="text-xs text-muted-foreground">
                  Lo cerró {shift.closed.byOtherName}
                </p>
              )}
            </div>
            {shift.closed ? (
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right text-sm">
                <CashDifference difference={shift.closed.difference} currency={currency} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  Contado {money(shift.closed.countedCash)} de {money(shift.closed.expectedCash)}
                </span>
              </div>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                Fondo {money(shift.openingAmount)}
              </span>
            )}
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
