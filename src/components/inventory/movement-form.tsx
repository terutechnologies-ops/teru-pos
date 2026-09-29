"use client";

import { useActionState } from "react";
import { Check, Loader2, PackagePlus, SlidersHorizontal } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { stockMovementAction } from "./movement-actions";
import type { MovementFormState } from "./movement-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

const initialState: MovementFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: { kind: "", quantity: "", reason: "" },
};

const KIND_OPTIONS = [
  { value: "IN", label: "Entrada" },
  { value: "OUT", label: "Salida" },
] as const;

// Carga inicial (bodega sin movimientos) o ajuste de una bodega, desplegable
// dentro de su fila (sin JS, con <details>). Tras guardar, la acción
// redirige a la ficha y el formulario vuelve a montarse cerrado.
export function MovementForm({
  mode,
  companySlug,
  supplyId,
  warehouseId,
  warehouseName,
  unitSymbol,
  kardexFilter,
}: {
  mode: "initial" | "adjust";
  companySlug: string;
  supplyId: string;
  warehouseId: string;
  warehouseName: string;
  unitSymbol: string;
  // Filtro del kardex que se conserva al volver.
  kardexFilter: string;
}) {
  const [state, formAction, pending] = useActionState(stockMovementAction, initialState);
  const { values, fieldErrors } = state;
  const initial = mode === "initial";
  // Prefijo de ids: hay un formulario por bodega en la página.
  const id = (name: string) => `mv-${warehouseId}-${name}`;
  const describedBy = (name: "kind" | "quantity" | "reason", extra?: string) =>
    cn(extra, fieldErrors[name] && `${id(name)}-error`) || undefined;

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
        {initial ? (
          <PackagePlus className="size-3.5" aria-hidden />
        ) : (
          <SlidersHorizontal className="size-3.5" aria-hidden />
        )}
        {initial ? "Carga inicial" : "Ajustar"}
        <span className="sr-only"> en {warehouseName}</span>
      </summary>

      <form
        action={formAction}
        className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="supplyId" value={supplyId} />
        <input type="hidden" name="warehouseId" value={warehouseId} />
        <input type="hidden" name="bodega" value={kardexFilter} />
        {initial && <input type="hidden" name="kind" value="INITIAL" />}

        <p className="text-xs text-muted-foreground">
          {initial
            ? `Registra lo que hay hoy en ${warehouseName}. Se hace una sola vez; después, los cambios se registran como ajustes.`
            : `Corrige la existencia de ${warehouseName} con una entrada o una salida.`}
        </p>

        {state.message && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {state.message}
          </p>
        )}

        {!initial && (
          <fieldset
            className="flex flex-col gap-1.5"
            aria-describedby={describedBy("kind")}
          >
            <legend className="mb-1.5 text-[13px] font-semibold">
              Tipo<span className="text-destructive">*</span>
            </legend>
            <div className="flex gap-2">
              {KIND_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-semibold has-checked:bg-primary has-checked:text-primary-foreground"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={option.value}
                    defaultChecked={values.kind === option.value}
                    required
                    className="accent-current"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {fieldErrors.kind && (
              <p id={`${id("kind")}-error`} className="text-xs font-medium text-destructive">
                {fieldErrors.kind}
              </p>
            )}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <FormField
            name={id("quantity")}
            label={`Cantidad (${unitSymbol})`}
            required
            error={fieldErrors.quantity}
          >
            <Input
              id={id("quantity")}
              name="quantity"
              type="number"
              inputMode="decimal"
              min={0.001}
              step={0.001}
              defaultValue={values.quantity}
              required
              aria-invalid={fieldErrors.quantity ? true : undefined}
              aria-describedby={describedBy("quantity")}
              className={fieldClass}
            />
          </FormField>

          <FormField
            name={id("reason")}
            label={initial ? "Nota" : "Motivo"}
            required={!initial}
            error={fieldErrors.reason}
          >
            <Input
              id={id("reason")}
              name="reason"
              defaultValue={values.reason}
              required={!initial}
              minLength={initial ? undefined : 3}
              maxLength={200}
              autoComplete="off"
              placeholder={initial ? "Opcional" : "Ej: Conteo físico, producto dañado, consumo interno"}
              aria-invalid={fieldErrors.reason ? true : undefined}
              aria-describedby={describedBy("reason")}
              className={fieldClass}
            />
          </FormField>
        </div>

        <Button type="submit" disabled={pending} className="h-10 w-fit gap-2 px-4">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {initial ? "Registrar carga inicial" : "Registrar ajuste"}
        </Button>
      </form>
    </details>
  );
}
