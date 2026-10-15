import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney, type DateFormat } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { StatementMovement } from "@/server/services/customers";

function daysText(days: number) {
  return days === 1 ? "1 día" : `${days} días`;
}

// Estado de la deuda de una venta completada: pagada, vencida o por vencer.
function DueBadge({
  due,
  today,
  dateFormat,
}: {
  due: NonNullable<StatementMovement["due"]>;
  today: string;
  dateFormat: DateFormat;
}) {
  if (Number(due.pending) === 0) return <Badge variant="secondary">Pagada</Badge>;
  if (due.daysOverdue > 0) {
    return <Badge variant="destructive">Vencida hace {daysText(due.daysOverdue)}</Badge>;
  }
  if (due.day === today) return <Badge variant="outline">Vence hoy</Badge>;
  return (
    <Badge variant="outline">Vence el {formatDate(new Date(`${due.day}T00:00:00Z`), dateFormat)}</Badge>
  );
}

// Movimientos de la cuenta, del más reciente al más antiguo: cada venta a
// crédito suma, cada abono resta; los anulados se ven pero no cuentan.
export function CustomerStatement({
  movements,
  companySlug,
  currency,
  dateFormat,
  timeZone,
  today,
  canViewSales,
  canViewShifts,
}: {
  movements: StatementMovement[];
  companySlug: string;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  today: string;
  canViewSales: boolean;
  canViewShifts: boolean;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);

  return (
    <ul className="flex flex-col divide-y divide-border">
      {movements.map((movement) => {
        const isSale = movement.kind === "SALE";
        const label = isSale ? `Venta #${movement.number}` : `Abono #${movement.number}`;
        const href = isSale
          ? canViewSales && `/${companySlug}/ventas/${movement.id}`
          : canViewShifts && `/${companySlug}/caja/${movement.cashSessionId}`;
        const partial =
          movement.due && Number(movement.due.pending) > 0 && movement.due.pending !== movement.amount;
        return (
          <li
            key={`${movement.kind}-${movement.id}`}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className={cn("flex min-w-0 flex-col gap-0.5", movement.voided && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-1.5">
                {href ? (
                  <Link href={href} className="font-bold text-link hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span className="font-bold">{label}</span>
                )}
                {movement.kind === "PAYMENT" && (
                  <span className="text-sm text-muted-foreground">· {movement.methodName}</span>
                )}
                {movement.voided && (
                  <Badge variant="secondary">{isSale ? "Anulada" : "Anulado"}</Badge>
                )}
                {movement.due && (
                  <DueBadge due={movement.due} today={today} dateFormat={dateFormat} />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(movement.at, dateFormat, timeZone)}
                {partial && movement.due && ` · Falta ${money(movement.due.pending)}`}
              </p>
            </div>

            <div className="flex shrink-0 flex-col sm:items-end">
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  movement.voided && "text-muted-foreground line-through",
                  !movement.voided && !isSale && "text-success",
                )}
              >
                {isSale ? "+" : "−"} {money(movement.amount)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {movement.balance === null ? "No cuenta en el saldo" : `Saldo ${money(movement.balance)}`}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
