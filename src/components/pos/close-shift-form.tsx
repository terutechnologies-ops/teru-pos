"use client";

import { useActionState } from "react";
import { Loader2, Lock, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { MoneyField } from "./money-field";
import { closeShiftAction } from "./shift-actions";
import { initialShiftState } from "./shift-fields";

// Cierre con conteo ciego: se escribe lo contado sin ver lo esperado.
export function CloseShiftForm({
  companySlug,
  currency,
}: {
  companySlug: string;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(closeShiftAction, initialShiftState);
  const { values, fieldErrors } = state;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="company" value={companySlug} />
      {state.error && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <MoneyField
        name="countedCash"
        label="Efectivo contado"
        currency={currency}
        defaultValue={values.countedCash}
        error={fieldErrors.countedCash}
        hint="Cuenta todo el efectivo de la caja, incluido el fondo inicial."
      />

      <FormField name="closingNote" label="Nota (opcional)" error={fieldErrors.closingNote}>
        <textarea
          id="closingNote"
          name="closingNote"
          defaultValue={values.closingNote}
          maxLength={200}
          rows={3}
          placeholder="Ej: pagué un domicilio con efectivo de la caja"
          aria-invalid={fieldErrors.closingNote ? true : undefined}
          aria-describedby={fieldErrors.closingNote ? "closingNote-error" : undefined}
          className="w-full min-w-0 rounded-lg border border-input bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </FormField>

      <Button type="submit" disabled={pending} size="lg" className="h-14 gap-2 text-base font-bold">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
        Cerrar turno
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Al cerrar verás la diferencia con lo esperado. Después ya no se puede cambiar.
      </p>
    </form>
  );
}
