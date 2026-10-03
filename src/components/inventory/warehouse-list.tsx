import Link from "next/link";
import { MapPin, Printer, Warehouse } from "lucide-react";

import { stockSheetHref } from "@/components/printing/print-sheets";
import { RenameForm } from "@/components/shared/rename-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WarehouseOverview } from "@/server/services/inventory";

import { renameWarehouseAction } from "./warehouse-actions";
import { WarehouseRowButton } from "./warehouse-row-button";

function stockLabel(count: number) {
  if (count === 0) return "Sin existencias";
  return count === 1 ? "1 insumo con existencias" : `${count} insumos con existencias`;
}

// Bodegas agrupadas por sucursal. El nombre de la sucursal solo se muestra
// si hay más de una.
export function WarehouseList({
  groups,
  companySlug,
}: {
  groups: WarehouseOverview["groups"];
  companySlug: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input px-6 py-10 text-center">
        <Warehouse className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">Aún no tienes bodegas</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Crea el lugar donde guardas tus insumos para empezar a llevar el inventario.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ branch, warehouses }) => (
        <section key={branch.id} className="flex flex-col gap-2">
          {groups.length > 1 && (
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {branch.name}
            </h3>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {warehouses.map((warehouse) => (
              <li
                key={warehouse.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
              >
                <div
                  className={cn(
                    "flex min-w-0 flex-1 flex-col gap-1.5",
                    !warehouse.isActive && "opacity-70",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-bold">{warehouse.name}</span>
                    {warehouse.isMain && <Badge variant="secondary">Principal</Badge>}
                    {!warehouse.isActive && <Badge variant="destructive">Inactiva</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stockLabel(warehouse.stockedSupplies)}
                  </p>
                  <RenameForm
                    key={warehouse.name}
                    action={renameWarehouseAction}
                    companySlug={companySlug}
                    id={warehouse.id}
                    currentName={warehouse.name}
                    maxLength={60}
                  />
                </div>

                <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                  {warehouse.isActive && (
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link href={stockSheetHref(companySlug, warehouse.id)}>
                        <Printer aria-hidden />
                        Imprimir existencias
                      </Link>
                    </Button>
                  )}
                  {!warehouse.isActive ? (
                    <WarehouseRowButton
                      companySlug={companySlug}
                      intent="activate"
                      id={warehouse.id}
                      warehouseName={warehouse.name}
                    />
                  ) : (
                    warehouse.canDeactivate && (
                      <WarehouseRowButton
                        companySlug={companySlug}
                        intent="deactivate"
                        id={warehouse.id}
                        warehouseName={warehouse.name}
                      />
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
