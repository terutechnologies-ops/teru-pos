import Link from "next/link";
import { Hash } from "lucide-react";

import { FilterField, filterControlClass } from "@/components/shared/filter-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PurchasesOverview } from "@/server/services/purchases";

// Filtros de la lista (GET: quedan en la dirección y funcionan sin JS) y
// acceso directo a una compra por su número.
export function PurchasesFilters({
  overview,
  basePath,
}: {
  overview: PurchasesOverview;
  basePath: string;
}) {
  const { filters, suppliers, warehouses, today, defaultFrom } = overview;
  const isDefault =
    filters.from === defaultFrom &&
    filters.to === today &&
    !filters.supplierId &&
    !filters.warehouseId &&
    !filters.status;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm">
      <form action={basePath} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField id="compras-desde" label="Desde">
            <input
              id="compras-desde"
              type="date"
              name="desde"
              defaultValue={filters.from}
              max={today}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField id="compras-hasta" label="Hasta">
            <input
              id="compras-hasta"
              type="date"
              name="hasta"
              defaultValue={filters.to}
              max={today}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField id="compras-proveedor" label="Proveedor">
            <select
              id="compras-proveedor"
              name="proveedor"
              defaultValue={filters.supplierId}
              className={filterControlClass}
            >
              <option value="">Todos</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.isArchived ? `${supplier.name} (archivado)` : supplier.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField id="compras-estado" label="Estado">
            <select
              id="compras-estado"
              name="estado"
              defaultValue={filters.status}
              className={filterControlClass}
            >
              <option value="">Todas</option>
              <option value="confirmadas">Confirmadas</option>
              <option value="anuladas">Anuladas</option>
            </select>
          </FilterField>
          {warehouses.length > 0 && (
            <FilterField id="compras-bodega" label="Bodega">
              <select
                id="compras-bodega"
                name="bodega"
                defaultValue={filters.warehouseId}
                className={filterControlClass}
              >
                <option value="">Todas</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </FilterField>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="h-10 px-4">
            Filtrar
          </Button>
          {!isDefault && (
            <Button asChild variant="ghost" className="h-10 px-3">
              <Link href={basePath}>Últimos 30 días</Link>
            </Button>
          )}
        </div>
      </form>

      <form
        action={basePath}
        className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="compras-numero" className="text-[13px] font-semibold">
          Ir a la compra
        </label>
        <div className="relative flex items-center">
          <Hash
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="compras-numero"
            name="numero"
            inputMode="numeric"
            pattern="#?[0-9]*"
            autoComplete="off"
            placeholder="Número"
            className="h-10 w-36 rounded-lg border-transparent bg-muted pl-9 text-sm focus-visible:bg-card"
          />
        </div>
        <Button type="submit" variant="outline" className="h-10 w-fit px-4">
          Ir
        </Button>
      </form>
    </div>
  );
}
