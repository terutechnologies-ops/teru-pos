"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";

import { MoneyField } from "@/components/pos/money-field";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { closeShiftFromPanelAction } from "./close-others-shift-actions";
import type { CloseOthersShiftFormState } from "./close-others-shift-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

const initialState: CloseOthersShiftFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: { countedCash: "", closingNote: "" },
};

// Cerrar el turno que otra persona dejó abierto: se despliega (sin JS, con
// <details>), pide el efectivo contado y el motivo.
export function CloseOthersShiftForm({
  companySlug,
  cashSessionId,
  cashierName,
  currency,
}: {
  companySlug: string;
  cashSessionId: string;
  cashierName: string;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(closeShiftFromPanelAction, initialState);
  const { values, fieldErrors } = state;

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Lock className="size-4" aria-hidden />
        Cerrar este turno
      </summary>

      <form
        action={formAction}
        className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="cashSessionId" value={cashSessionId} />

        <p className="text-sm text-muted-foreground">
          Cuenta el efectivo de la caja de {cashierName}. Al cerrar queda el cuadre con tu nombre
          y sus ventas ya no se pueden anular. No se puede deshacer.
        </p>

        {state.message && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.message}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <MoneyField
            name="countedCash"
            label="Efectivo contado"
            currency={currency}
            size="md"
            defaultValue={values.countedCash}
            placeholder="150.000"
            error={fieldErrors.countedCash}
          />
          <FormField name="close-note" label="Motivo" required error={fieldErrors.closingNote}>
            <Input
              id="close-note"
              name="closingNote"
              defaultValue={values.closingNote}
              required
              minLength={3}
              maxLength={200}
              autoComplete="off"
              placeholder="Ej: Olvidó cerrar su turno"
              aria-invalid={fieldErrors.closingNote ? true : undefined}
              aria-describedby={fieldErrors.closingNote ? "close-note-error" : undefined}
              className={fieldClass}
            />
          </FormField>
        </div>

        <Button type="submit" disabled={pending} className="h-10 w-fit gap-2 px-4">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
          Cerrar el turno
        </Button>
      </form>
    </details>
  );
}
