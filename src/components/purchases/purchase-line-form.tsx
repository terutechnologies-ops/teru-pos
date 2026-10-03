"use client";

import { useActionState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";

import { MoneyField } from "@/components/pos/money-field";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StockUnit } from "@/generated/prisma/enums";
import { amountInputValue } from "@/lib/company-formats";
import { familyUnits, unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { PurchaseItemField } from "@/server/services/purchases";

import { updatePurchaseLineAction } from "./purchase-actions";
import { formState } from "./purchase-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// "Cambiar" desplegable dentro de una línea (sin JS, con <details>). Las
// unidades ya vienen filtradas por la familia del insumo. Usarlo con
// key = cantidad, unidad y total: tras guardar se vuelve a montar cerrado.
export function PurchaseLineForm({
  companySlug,
  id,
  currency,
  supplyUnit,
  quantity,
  unit,
  lineTotal,
}: {
  companySlug: string;
  id: string;
  currency: string;
  supplyUnit: StockUnit;
  quantity: string;
  unit: StockUnit;
  lineTotal: string;
}) {
  const [state, formAction, pending] = useActionState(
    updatePurchaseLineAction,
    formState<PurchaseItemField>({
      supplyId: "",
      quantity,
      unit,
      lineTotal: amountInputValue(lineTotal, currency),
    }),
  );
  const { values, fieldErrors } = state;
  const prefix = `line-${id}`;
  const errorId = (name: PurchaseItemField) =>
    fieldErrors[name] ? `${prefix}-${name}-error` : undefined;

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-semibold text-link [&::-webkit-details-marker]:hidden">
        <Pencil className="size-3" aria-hidden />
        Cambiar
      </summary>
      <form action={formAction} className="mt-2 flex max-w-2xl flex-col gap-2">
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={id} />
        {state.message && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {state.message}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-[7rem_9rem_minmax(0,10rem)_auto] sm:items-start">
          <FormField name={`${prefix}-quantity`} label="Cantidad" error={fieldErrors.quantity}>
            <Input
              id={`${prefix}-quantity`}
              name="quantity"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.001}
              defaultValue={values.quantity}
              required
              aria-invalid={fieldErrors.quantity ? true : undefined}
              aria-describedby={errorId("quantity")}
              className={fieldClass}
            />
          </FormField>
          <FormField name={`${prefix}-unit`} label="Unidad" error={fieldErrors.unit}>
            <select
              id={`${prefix}-unit`}
              name="unit"
              defaultValue={values.unit}
              required
              aria-invalid={fieldErrors.unit ? true : undefined}
              aria-describedby={errorId("unit")}
              className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
            >
              {familyUnits(supplyUnit).map((option) => (
                <option key={option} value={option}>
                  {unitLabel(option)}
                </option>
              ))}
            </select>
          </FormField>
          <MoneyField
            name="lineTotal"
            id={`${prefix}-lineTotal`}
            label="Total pagado"
            currency={currency}
            size="md"
            defaultValue={values.lineTotal}
            error={fieldErrors.lineTotal}
          />
          <Button type="submit" disabled={pending} className="h-10 gap-1.5 sm:mt-[1.625rem]">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Guardar
          </Button>
        </div>
      </form>
    </details>
  );
}
