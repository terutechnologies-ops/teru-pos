"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StockUnit } from "@/generated/prisma/enums";
import { familyUnits, isStockUnit, STOCK_UNITS, unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";

import { addRecipeItemAction } from "./recipe-actions";
import { recipeFormState } from "./recipe-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// Agrega un insumo a la receta. Con JS, al elegir el insumo se preselecciona
// su unidad y solo se ofrecen las de su familia; sin JS se ofrecen todas y
// el servidor rechaza las que no correspondan. Usarlo con key = líneas de
// la receta: tras agregar se vuelve a montar vacío.
export function AddRecipeItemForm({
  companySlug,
  productId,
  supplies,
}: {
  companySlug: string;
  productId: string;
  supplies: { id: string; name: string; unit: StockUnit }[];
}) {
  const [state, formAction, pending] = useActionState(
    addRecipeItemAction,
    recipeFormState({ supplyId: "", quantity: "", unit: "" }),
  );
  const { values, fieldErrors } = state;
  const [supplyId, setSupplyId] = useState(values.supplyId);
  const [unit, setUnit] = useState(values.unit);
  const supplyUnit = supplies.find((supply) => supply.id === supplyId)?.unit;
  const units = supplyUnit ? familyUnits(supplyUnit) : STOCK_UNITS;
  const describedBy = (name: "supplyId" | "quantity" | "unit") =>
    fieldErrors[name] ? `${name}-error` : undefined;

  function chooseSupply(id: string) {
    setSupplyId(id);
    const chosen = supplies.find((supply) => supply.id === id)?.unit;
    if (chosen && !(isStockUnit(unit) && familyUnits(chosen).includes(unit))) setUnit(chosen);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="productId" value={productId} />

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] sm:items-start">
        <FormField name="supplyId" label="Insumo" required error={fieldErrors.supplyId}>
          <select
            id="supplyId"
            name="supplyId"
            value={supplyId}
            onChange={(event) => chooseSupply(event.target.value)}
            required
            aria-invalid={fieldErrors.supplyId ? true : undefined}
            aria-describedby={describedBy("supplyId")}
            className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
          >
            <option value="">Elige un insumo…</option>
            {supplies.map((supply) => (
              <option key={supply.id} value={supply.id}>
                {supply.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField name="quantity" label="Cantidad" required error={fieldErrors.quantity}>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            defaultValue={values.quantity}
            required
            placeholder="120"
            aria-invalid={fieldErrors.quantity ? true : undefined}
            aria-describedby={describedBy("quantity")}
            className={fieldClass}
          />
        </FormField>

        <FormField name="unit" label="Unidad" required error={fieldErrors.unit}>
          <select
            id="unit"
            name="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            required
            aria-invalid={fieldErrors.unit ? true : undefined}
            aria-describedby={describedBy("unit")}
            className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
          >
            <option value="">Unidad…</option>
            {units.map((option) => (
              <option key={option} value={option}>
                {unitLabel(option)}
              </option>
            ))}
          </select>
        </FormField>

        <Button type="submit" disabled={pending} className="h-10 gap-1.5 px-4 sm:mt-[1.625rem]">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Agregar
        </Button>
      </div>
    </form>
  );
}
