import Link from "next/link";

import { FilterField, filterControlClass } from "@/components/shared/filter-field";
import { Button } from "@/components/ui/button";
import type { CashMovementsOverview } from "@/server/services/cash-movements";

// Filtros de los movimientos de caja (GET: quedan en la dirección y
// funcionan sin JS). Las fechas son las del registro del movimiento.
// "Mostrar" elige un tipo o una categoría de gasto.
export function CashMovementFilters({
  overview,
  basePath,
}: {
  overview: CashMovementsOverview;
  basePath: string;
}) {
  const { filters, categories, cashiers, branches, today } = overview;
  const isDefault =
    filters.from === today &&
    filters.to === today &&
    !filters.view &&
    !filters.cashierId &&
    !filters.branchId;

  return (
    <form action={basePath} className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterField id="gastos-desde" label="Desde">
          <input
            id="gastos-desde"
            type="date"
            name="desde"
            defaultValue={filters.from}
            max={today}
            className={filterControlClass}
          />
        </FilterField>
        <FilterField id="gastos-hasta" label="Hasta">
          <input
            id="gastos-hasta"
            type="date"
            name="hasta"
            defaultValue={filters.to}
            max={today}
            className={filterControlClass}
          />
        </FilterField>
        <FilterField id="gastos-ver" label="Mostrar">
          <select
            id="gastos-ver"
            name="ver"
            defaultValue={filters.view}
            className={filterControlClass}
          >
            <option value="">Todos los movimientos</option>
            <option value="gastos">Todos los gastos</option>
            {categories.length > 0 && (
              <optgroup label="Gastos por categoría">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {!category.isActive && " (inactiva)"}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="retiros">Retiros</option>
            <option value="ingresos">Ingresos</option>
          </select>
        </FilterField>
        <FilterField id="gastos-cajero" label="Cajero">
          <select
            id="gastos-cajero"
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
          <FilterField id="gastos-sucursal" label="Sucursal">
            <select
              id="gastos-sucursal"
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
