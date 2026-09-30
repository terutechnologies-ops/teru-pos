"use client";

import { useActionState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StockUnit } from "@/generated/prisma/enums";
import { familyUnits, unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";

import { updateRecipeItemAction } from "./recipe-actions";
import { recipeFormState } from "./recipe-fields";

const fieldClass = "h-9 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// "Cambiar" desplegable dentro de una línea (sin JS, con <details>). Las
// unidades ya vienen filtradas por la familia del insumo. Usarlo con
// key = cantidad y unidad: tras guardar se vuelve a montar cerrado.
export function RecipeLineForm({
  companySlug,
  id,
  supplyName,
  supplyUnit,
  quantity,
  unit,
}: {
  companySlug: string;
  id: string;
  supplyName: string;
  supplyUnit: StockUnit;
  quantity: string;
  unit: StockUnit;
}) {
  const [state, formAction, pending] = useActionState(
    updateRecipeItemAction,
    recipeFormState({ supplyId: "", quantity, unit }),
  );
  const { values, fieldErrors } = state;
  const prefix = `line-${id}`;
  const error = state.message ?? fieldErrors.quantity ?? fieldErrors.unit;

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-semibold text-link [&::-webkit-details-marker]:hidden">
        <Pencil className="size-3" aria-hidden />
        Cambiar
      </summary>
      <form action={formAction} className="mt-2 flex max-w-md flex-col gap-1">
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={id} />
        <div className="flex gap-2">
          <Input
            id={`${prefix}-quantity`}
            name="quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            defaultValue={values.quantity}
            required
            aria-label={`Cantidad de ${supplyName}`}
            aria-invalid={fieldErrors.quantity ? true : undefined}
            aria-describedby={error ? `${prefix}-error` : undefined}
            className={cn(fieldClass, "w-28")}
          />
          <select
            name="unit"
            defaultValue={values.unit}
            required
            aria-label={`Unidad de ${supplyName}`}
            aria-invalid={fieldErrors.unit ? true : undefined}
            className={cn(fieldClass, "min-w-0 flex-1 border px-3 outline-none")}
          >
            {familyUnits(supplyUnit).map((option) => (
              <option key={option} value={option}>
                {unitLabel(option)}
              </option>
            ))}
          </select>
          <Button type="submit" size="lg" disabled={pending} className="shrink-0 gap-1.5">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Guardar
          </Button>
        </div>
        {error && (
          <p id={`${prefix}-error`} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
