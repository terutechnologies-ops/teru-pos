import Link from "next/link";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUnitCost } from "@/lib/company-formats";
import { formatQuantity, UNIT_INFO } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { SupplyDto } from "@/server/services/inventory";

import { SUPPLY_ALERT_INFO } from "./supply-fields";
import { SupplyRowButton } from "./supply-row-button";

// Insumos en orden alfabético con su existencia total (todas las bodegas).
export function SupplyList({
  supplies,
  currency,
  companySlug,
}: {
  supplies: SupplyDto[];
  currency: string;
  companySlug: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card px-5 shadow-sm sm:px-6">
      {supplies.map((supply) => (
        <li
          key={supply.id}
          className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
        >
          <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", supply.isArchived && "opacity-70")}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/${companySlug}/inventario/insumos/${supply.id}`}
                className="truncate font-bold hover:underline"
              >
                {supply.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                · {UNIT_INFO[supply.unit].label.toLowerCase()}
              </span>
              {supply.isArchived ? (
                <Badge variant="secondary">Archivado</Badge>
              ) : (
                <>
                  {supply.negativeStock && (
                    <Badge variant="destructive">{SUPPLY_ALERT_INFO["saldo-negativo"].badge}</Badge>
                  )}
                  {supply.uninitialized && (
                    <Badge variant="outline">{SUPPLY_ALERT_INFO["sin-carga"].badge}</Badge>
                  )}
                  {supply.belowMinimum && (
                    <Badge variant="destructive">{SUPPLY_ALERT_INFO["bajo-minimo"].badge}</Badge>
                  )}
                </>
              )}
            </div>
            <p className="text-sm">
              <span
                className={cn(
                  "font-semibold",
                  supply.totalStock.startsWith("-") && "text-destructive",
                )}
              >
                {formatQuantity(supply.totalStock, supply.unit)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                en existencia
                {supply.minStock !== null &&
                  ` · mínimo ${formatQuantity(supply.minStock, supply.unit)}`}
                {" · "}
                {supply.unitCost === null
                  ? "sin costo"
                  : `costo ${formatUnitCost(supply.unitCost, currency)}/${UNIT_INFO[supply.unit].symbol}`}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/${companySlug}/inventario/insumos/${supply.id}/editar`}
                aria-label={`Editar ${supply.name}`}
              >
                <Pencil aria-hidden />
                Editar
              </Link>
            </Button>
            <SupplyRowButton
              companySlug={companySlug}
              intent={supply.isArchived ? "restore" : "archive"}
              id={supply.id}
              supplyName={supply.name}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
