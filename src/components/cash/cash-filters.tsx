import Link from "next/link";

import { FilterField, filterControlClass } from "@/components/shared/filter-field";
import { Button } from "@/components/ui/button";
import type { CashOverview } from "@/server/services/cash-sessions";

// Filtros de los turnos cerrados (GET: quedan en la dirección y funcionan
// sin JS). Las fechas son del día de apertura del turno.
export function CashFilters({
  overview,
  basePath,
}: {
  overview: CashOverview;
  basePath: string;
}) {
  const { filters, cashiers, branches, today } = overview;
  const isDefault =
    filters.from === today && filters.to === today && !filters.cashierId && !filters.branchId;

  return (
    <form action={basePath} className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField id="caja-desde" label="Abiertos desde">
          <input
            id="caja-desde"
            type="date"
            name="desde"
            defaultValue={filters.from}
            max={today}
            className={filterControlClass}
          />
        </FilterField>
        <FilterField id="caja-hasta" label="Hasta">
          <input
            id="caja-hasta"
            type="date"
            name="hasta"
            defaultValue={filters.to}
            max={today}
            className={filterControlClass}
          />
        </FilterField>
        <FilterField id="caja-cajero" label="Cajero">
          <select
            id="caja-cajero"
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
        {branches.length > 0 && (
          <FilterField id="caja-sucursal" label="Sucursal">
            <select
              id="caja-sucursal"
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
  );
}
