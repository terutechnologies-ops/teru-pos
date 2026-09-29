"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Boxes, Loader2, Lock, Save, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isStockUnit, STOCK_UNITS, UNIT_INFO, unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";

import type { SaveSupplyAction, SupplyFormState, SupplyFormValues } from "./supply-fields";

const fieldClass = "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// Crear y editar insumos. Con movimientos, la unidad queda fija: el select
// se deshabilita y la unidad actual viaja en un campo oculto.
export function SupplyForm({
  action,
  companySlug,
  supplyId,
  unitLocked = false,
  initialValues,
  submitLabel,
  cancelHref,
}: {
  action: SaveSupplyAction;
  companySlug: string;
  supplyId?: string;
  unitLocked?: boolean;
  initialValues: SupplyFormValues;
  submitLabel: string;
  // Por defecto, la lista de insumos.
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    message: null,
    fieldErrors: {},
    values: initialValues,
  } satisfies SupplyFormState);
  const { values, fieldErrors } = state;
  const [unit, setUnit] = useState(values.unit);
  const symbol = isStockUnit(unit) ? UNIT_INFO[unit].symbol : null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="company" value={companySlug} />
      {supplyId && <input type="hidden" name="id" value={supplyId} />}
      {unitLocked && <input type="hidden" name="unit" value={values.unit} />}

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Boxes className="size-5" aria-hidden />}
          title="Datos del insumo"
          description="Todas sus cantidades (existencias, ajustes y mínimo) se expresan en su unidad."
        />

        <FormField name="name" label="Nombre" required error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Ej: Harina de maíz, Queso rallado, Gaseosa 400 ml"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={fieldClass}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField name="unit" label="Unidad" required error={fieldErrors.unit}>
            <select
              id="unit"
              name={unitLocked ? undefined : "unit"}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              disabled={unitLocked}
              required
              aria-invalid={fieldErrors.unit ? true : undefined}
              aria-describedby={cn(
                unitLocked && "unit-locked",
                fieldErrors.unit && "unit-error",
              ) || undefined}
              className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none disabled:opacity-70")}
            >
              <option value="">Elige una unidad…</option>
              {STOCK_UNITS.map((option) => (
                <option key={option} value={option}>
                  {unitLabel(option)}
                </option>
              ))}
            </select>
            {unitLocked && (
              <p id="unit-locked" className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                No se puede cambiar: el insumo ya tiene movimientos.
              </p>
            )}
          </FormField>

          <FormField
            name="minStock"
            label={symbol ? `Stock mínimo (${symbol})` : "Stock mínimo"}
            error={fieldErrors.minStock}
          >
            <Input
              id="minStock"
              name="minStock"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.001}
              defaultValue={values.minStock}
              placeholder="Opcional"
              aria-invalid={fieldErrors.minStock ? true : undefined}
              aria-describedby={cn("minStock-help", fieldErrors.minStock && "minStock-error")}
              className={fieldClass}
            />
            <p id="minStock-help" className="text-xs text-muted-foreground">
              Por debajo de esta cantidad (sumando todas las bodegas) se marcará como bajo mínimo.
            </p>
          </FormField>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 -mb-6 flex items-center justify-end gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href={cancelHref ?? `/${companySlug}/inventario/insumos`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-11 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
