import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatClock, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { CustomerPaymentDto } from "@/server/services/customer-payments";

// Abonos de clientes de un turno, del más antiguo al más reciente: número,
// cliente, método y lo que quedó debiendo. Los anulados se ven tachados con
// quién y por qué. Cada pantalla agrega sus acciones (imprimir, anular).
export function CustomerPaymentList({
  payments,
  currency,
  timeZone,
  renderActions,
}: {
  payments: CustomerPaymentDto[];
  currency: string;
  timeZone: string;
  renderActions?: (payment: CustomerPaymentDto) => ReactNode;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);
  return (
    <ul className="flex flex-col divide-y divide-border">
      {payments.map((payment) => (
        <li key={payment.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", payment.voided && "opacity-70")}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatClock(payment.createdAt, timeZone)}
              </span>
              <span className="font-bold">Abono #{payment.number}</span>
              <span className="truncate text-sm">· {payment.customerName}</span>
              {payment.voided && <Badge variant="destructive">Anulado</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {payment.methodName} · quedó debiendo {money(payment.balanceAfter)}
            </p>
            {payment.note && (
              <p className="text-sm break-words text-muted-foreground">{payment.note}</p>
            )}
            {payment.voided && (
              <p className="text-xs text-muted-foreground">
                Lo anuló {payment.voided.byName}: {payment.voided.reason}
              </p>
            )}
            {renderActions?.(payment)}
          </div>
          <span
            className={cn(
              "shrink-0 font-extrabold tabular-nums",
              payment.voided && "text-muted-foreground line-through",
            )}
          >
            {money(payment.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
