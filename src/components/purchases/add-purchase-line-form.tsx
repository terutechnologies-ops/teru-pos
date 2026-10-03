"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, TriangleAlert } from "lucide-react";

import { MoneyField } from "@/components/pos/money-field";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StockUnit } from "@/generated/prisma/enums";
import { familyUnits, isStockUnit, STOCK_UNITS, unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { PurchaseItemField } from "@/server/services/purchases";

import { addPurchaseLineAction } from "./purchase-actions";
import { formState } from "./purchase-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// Agrega un insumo a la compra. Con JS, al elegir el insumo se preselecciona
// su unidad y solo se ofrecen las de su familia; sin JS se ofrecen todas y
// el servidor rechaza las que no correspondan. Usarlo con key = líneas de
// la compra: tras agregar se vuelve a montar vacío.
export function AddPurchaseLineForm({
  companySlug,
  purchaseId,
  currency,
  supplies,
}: {
  companySlug: string;
  purchaseId: string;
  currency: string;
  supplies: { id: string; name: string; unit: StockUnit }[];
}) {
  const [state, formAction, pending] = useActionState(
    addPurchaseLineAction,
    formState<PurchaseItemField>({ supplyId: "", quantity: "", unit: "", lineTotal: "" }),
  );
  const { values, fieldErrors } = state;
  const [supplyId, setSupplyId] = useState(values.supplyId);
  const [unit, setUnit] = useState(values.unit);
  const supplyUnit = supplies.find((supply) => supply.id === supplyId)?.unit;
  const units = supplyUnit ? familyUnits(supplyUnit) : STOCK_UNITS;
  const describedBy = (name: PurchaseItemField) =>
    fieldErrors[name] ? `${name}-error` : undefined;

  function chooseSupply(id: string) {
    setSupplyId(id);
    const chosen = supplies.find((supply) => supply.id === id)?.unit;
    if (chosen && !(isStockUnit(unit) && familyUnits(chosen).includes(unit))) setUnit(chosen);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="purchaseId" value={purchaseId} />

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_7rem_9rem_10rem_auto] lg:items-start">
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
            placeholder="25"
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

        <MoneyField
          name="lineTotal"
          label="Total pagado"
          currency={currency}
          size="md"
          defaultValue={values.lineTotal}
          placeholder="80.000"
          error={fieldErrors.lineTotal}
        />

        <Button type="submit" disabled={pending} className="h-10 gap-1.5 px-4 lg:mt-[1.625rem]">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Agregar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Total pagado: lo que cobró el proveedor por esa cantidad, con impuestos.
      </p>
    </form>
  );
}
