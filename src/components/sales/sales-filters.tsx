import Link from "next/link";
import { Hash } from "lucide-react";

import { FilterField, filterControlClass } from "@/components/shared/filter-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SalesOverview } from "@/server/services/sales";

// Filtros de la lista (GET: quedan en la dirección y funcionan sin JS) y
// acceso directo a una venta por su número.
export function SalesFilters({
  overview,
  basePath,
}: {
  overview: SalesOverview;
  basePath: string;
}) {
  const { filters, cashiers, branches, today } = overview;
  const isDefault =
    filters.from === today &&
    filters.to === today &&
    !filters.cashierId &&
    !filters.branchId &&
    !filters.status;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm">
      <form action={basePath} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField id="ventas-desde" label="Desde">
            <input
              id="ventas-desde"
              type="date"
              name="desde"
              defaultValue={filters.from}
              max={today}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField id="ventas-hasta" label="Hasta">
            <input
              id="ventas-hasta"
              type="date"
              name="hasta"
              defaultValue={filters.to}
              max={today}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField id="ventas-cajero" label="Cajero">
            <select
              id="ventas-cajero"
              name="cajero"
              defaultValue={filters.cashierId}
              className={filterControlClass}
            >
              <option value="">Todos</option>
              {cashiers.map((cashier) => (
                <option key={cashier.id} value={cashier.id}>
                  {cashier.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField id="ventas-estado" label="Estado">
            <select
              id="ventas-estado"
              name="estado"
              defaultValue={filters.status}
              className={filterControlClass}
            >
              <option value="">Todas</option>
              <option value="completadas">Completadas</option>
              <option value="anuladas">Anuladas</option>
            </select>
          </FilterField>
          {branches.length > 0 && (
            <FilterField id="ventas-sucursal" label="Sucursal">
              <select
                id="ventas-sucursal"
                name="sucursal"
                defaultValue={filters.branchId}
                className={filterControlClass}
              >
                <option value="">Todas</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
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
              <Link href={basePath}>Ver hoy</Link>
            </Button>
          )}
        </div>
      </form>

      <form
        action={basePath}
        className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="ventas-numero" className="text-[13px] font-semibold">
          Ir a la venta
        </label>
        <div className="relative flex items-center">
          <Hash
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="ventas-numero"
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
