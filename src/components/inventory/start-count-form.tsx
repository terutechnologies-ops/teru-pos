"use client";

import { useActionState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";

import type { RowActionState } from "@/components/shared/row-action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { startCountAction } from "./count-actions";

const initialState: RowActionState = { error: null };

type WarehouseOption = { id: string; name: string; branchName: string };

// "Nuevo conteo" en la página de conteos: con varias bodegas se elige cuál;
// con una sola, el botón la abre directo. Si la bodega ya tiene un
// borrador, se retoma.
export function StartCountForm({
  companySlug,
  warehouses,
  showBranch,
}: {
  companySlug: string;
  warehouses: WarehouseOption[];
  showBranch: boolean;
}) {
  const [state, formAction, pending] = useActionState(startCountAction, initialState);
  const single = warehouses.length === 1 ? warehouses[0] : null;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="company" value={companySlug} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {single ? (
          <input type="hidden" name="warehouseId" value={single.id} />
        ) : (
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-80">
            <label htmlFor="count-warehouse" className="text-[13px] font-semibold">
              Bodega
            </label>
            <select
              id="count-warehouse"
              name="warehouseId"
              required
              defaultValue=""
              className="h-10 min-w-0 rounded-lg border border-transparent bg-muted px-3 text-sm outline-none focus-visible:bg-card"
            >
              <option value="" disabled>
                Elige la bodega
              </option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {showBranch ? `${warehouse.branchName} · ${warehouse.name}` : warehouse.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" disabled={pending} className="h-10 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
          {single ? `Contar ${single.name}` : "Empezar conteo"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

// "Registrar conteo" junto a "Imprimir existencias" (Bodegas e Insumos).
export function RegisterCountButton({
  companySlug,
  warehouseId,
  size = "sm",
}: {
  companySlug: string;
  warehouseId: string;
  size?: "sm" | "lg";
}) {
  const [state, formAction, pending] = useActionState(startCountAction, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <Button
        type="submit"
        variant="outline"
        size={size === "sm" ? "sm" : "default"}
        disabled={pending}
        className={cn("gap-2", size === "lg" && "h-11")}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
        Registrar conteo
      </Button>
      {state.error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
