import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatQuantity, UNIT_INFO } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { SupplyDetail } from "@/server/services/inventory";

import { MovementForm } from "./movement-form";

// Existencias del insumo en cada bodega activa, agrupadas por sucursal (el
// nombre de la sucursal solo si hay más de una). Con el insumo archivado,
// solo lectura.
export function SupplyStock({
  detail,
  companySlug,
  kardexFilter,
}: {
  detail: SupplyDetail;
  companySlug: string;
  kardexFilter: string;
}) {
  const { supply, stock } = detail;

  if (stock.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay bodegas activas. Crea o activa una en Inventario › Bodegas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {stock.map(({ branch, warehouses }) => (
        <section key={branch.id} className="flex flex-col gap-2">
          {stock.length > 1 && (
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {branch.name}
            </h3>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {warehouses.map((warehouse) => (
              <li key={warehouse.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate font-bold">{warehouse.name}</span>
                    {warehouse.isMain && <Badge variant="secondary">Principal</Badge>}
                  </div>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      warehouse.quantity.startsWith("-") && "text-destructive",
                    )}
                  >
                    {warehouse.initialized
                      ? formatQuantity(warehouse.quantity, supply.unit)
                      : "Sin carga inicial"}
                  </span>
                </div>
                {!supply.isArchived && (
                  <MovementForm
                    // El saldo cambia con cada movimiento: la fila vuelve a
                    // montarse con el formulario cerrado y limpio.
                    key={`${warehouse.initialized}-${warehouse.quantity}`}
                    mode={warehouse.initialized ? "adjust" : "initial"}
                    companySlug={companySlug}
                    supplyId={supply.id}
                    warehouseId={warehouse.id}
                    warehouseName={warehouse.name}
                    unitSymbol={UNIT_INFO[supply.unit].symbol}
                    kardexFilter={kardexFilter}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
