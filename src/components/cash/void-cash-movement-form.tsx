"use client";

import { useActionState } from "react";
import { Ban, Loader2 } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { voidCashMovementAction } from "./void-cash-movement-actions";
import type { VoidCashMovementFormState } from "./void-cash-movement-fields";

const initialState: VoidCashMovementFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  reason: "",
};

// Anular un gasto, retiro o ingreso del turno abierto: se despliega (sin
// JS, con <details>) y pide el motivo; el segundo botón es la confirmación.
export function VoidCashMovementForm({
  companySlug,
  cashSessionId,
  movementId,
  label,
}: {
  companySlug: string;
  cashSessionId: string;
  movementId: string;
  // "gasto", "retiro" o "ingreso".
  label: string;
}) {
  const [state, formAction, pending] = useActionState(voidCashMovementAction, initialState);
  const reasonError = state.fieldErrors.reason;
  const inputId = `void-movement-${movementId}`;

  return (
    <details className="group mt-1" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-semibold text-destructive hover:underline [&::-webkit-details-marker]:hidden">
        <Ban className="size-4" aria-hidden />
        Anular
      </summary>

      <form
        action={formAction}
        className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="cashSessionId" value={cashSessionId} />
        <input type="hidden" name="movementId" value={movementId} />

        <p className="text-sm text-muted-foreground">
          Queda registrado como anulado y deja de contar en el efectivo esperado del turno. No
          se puede deshacer.
        </p>

        {state.message && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.message}
          </p>
        )}

        <FormField name={inputId} label="Motivo" required error={reasonError}>
          <Input
            id={inputId}
            name="reason"
            defaultValue={state.reason}
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
            placeholder="Ej: Se registró dos veces, el monto estaba mal"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${inputId}-error` : undefined}
            className="h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card"
          />
        </FormField>

        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="h-10 w-fit gap-2 px-4"
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
          Anular el {label}
        </Button>
      </form>
    </details>
  );
}
