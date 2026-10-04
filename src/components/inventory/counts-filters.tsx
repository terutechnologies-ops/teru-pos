import Link from "next/link";
import { Hash } from "lucide-react";

import { FilterField, filterControlClass } from "@/components/shared/filter-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CountsOverview } from "@/server/services/inventory-counts";

// Filtros de los conteos confirmados (GET: quedan en la dirección y
// funcionan sin JS) y acceso directo a un conteo por su número.
export function CountsFilters({
  overview,
  basePath,
}: {
  overview: CountsOverview;
  basePath: string;
}) {
  const { filters, warehouses, today, defaultFrom } = overview;
  const isDefault = filters.from === defaultFrom && filters.to === today && !filters.warehouseId;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm">
      <form action={basePath} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterField id="conteos-desde" label="Desde">
            <input
              id="conteos-desde"
              type="date"
              name="desde"
              defaultValue={filters.from}
              max={today}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField id="conteos-hasta" label="Hasta">
            <input
              id="conteos-hasta"
              type="date"
              name="hasta"
              defaultValue={filters.to}
              max={today}
              className={filterControlClass}
            />
          </FilterField>
          {warehouses.length > 0 && (
            <FilterField id="conteos-bodega" label="Bodega">
              <select
                id="conteos-bodega"
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
              <Link href={basePath}>Últimos 90 días</Link>
            </Button>
          )}
        </div>
      </form>

      <form
        action={basePath}
        className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="conteos-numero" className="text-[13px] font-semibold">
          Ir al conteo
        </label>
        <div className="relative flex items-center">
          <Hash
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="conteos-numero"
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
