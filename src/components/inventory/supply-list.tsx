import Link from "next/link";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatQuantity, UNIT_INFO } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { SupplyDto } from "@/server/services/inventory";

import { SupplyRowButton } from "./supply-row-button";

// Insumos en orden alfabético con su existencia total (todas las bodegas).
export function SupplyList({
  supplies,
  companySlug,
}: {
  supplies: SupplyDto[];
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
              <span className="truncate font-bold">{supply.name}</span>
              <span className="text-xs text-muted-foreground">
                · {UNIT_INFO[supply.unit].label.toLowerCase()}
              </span>
              {supply.isArchived && <Badge variant="secondary">Archivado</Badge>}
              {!supply.isArchived && supply.belowMinimum && (
                <Badge variant="destructive">Bajo mínimo</Badge>
              )}
            </div>
            <p className="text-sm">
              <span className="font-semibold">{formatQuantity(supply.totalStock, supply.unit)}</span>
              <span className="text-muted-foreground">
                {" "}
                en existencia
                {supply.minStock !== null &&
                  ` · mínimo ${formatQuantity(supply.minStock, supply.unit)}`}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/${companySlug}/inventario/insumos/${supply.id}`}
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
