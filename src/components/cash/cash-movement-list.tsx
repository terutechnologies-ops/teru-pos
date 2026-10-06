import type { ReactNode } from "react";
import { ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatClock, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { CashMovementDto } from "@/server/services/cash-movements";

import { CASH_MOVEMENT_KINDS } from "./cash-movement-kinds";

// Movimientos de un turno, del más antiguo al más reciente. Los anulados se
// ven tachados con quién los anuló y por qué. El recibo se abre con un
// enlace firmado (ruta /recibos/[id]). El panel agrega sus acciones
// (anular) con renderActions.
export function CashMovementList({
  movements,
  currency,
  timeZone,
  companySlug,
  renderActions,
}: {
  movements: CashMovementDto[];
  currency: string;
  timeZone: string;
  companySlug: string;
  renderActions?: (movement: CashMovementDto) => ReactNode;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {movements.map((movement) => {
        const kind = CASH_MOVEMENT_KINDS[movement.type];
        return (
          <li key={movement.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", movement.voided && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatClock(movement.createdAt, timeZone)}
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
              {movement.hasReceipt && (
                <a
                  href={`/${companySlug}/recibos/${movement.id}`}
                  target="_blank"
                  rel="noopener"
                  className="mt-0.5 inline-flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
                >
                  <ReceiptText className="size-4" aria-hidden />
                  Ver recibo
                </a>
              )}
              {renderActions?.(movement)}
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
