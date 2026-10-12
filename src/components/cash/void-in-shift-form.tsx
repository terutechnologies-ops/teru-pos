"use client";

import { useActionState } from "react";
import { Ban, Loader2 } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { initialVoidInShiftState, type VoidInShiftFormState } from "./void-in-shift-fields";

// Anular un registro del turno abierto (gasto, retiro, ingreso o abono): se
// despliega (sin JS, con <details>) y pide el motivo; el segundo botón es la
// confirmación. La acción recibe company, cashSessionId, recordId y reason.
export function VoidInShiftForm({
  companySlug,
  cashSessionId,
  recordId,
  label,
  description,
  action,
}: {
  companySlug: string;
  cashSessionId: string;
  recordId: string;
  // "gasto", "retiro", "ingreso" o "abono #12": el botón dice "Anular el …".
  label: string;
  // Qué pasa al anular.
  description: string;
  action: (state: VoidInShiftFormState, formData: FormData) => Promise<VoidInShiftFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialVoidInShiftState);
  const reasonError = state.fieldErrors.reason;
  const inputId = `void-${recordId}`;

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
        <input type="hidden" name="recordId" value={recordId} />

        <p className="text-sm text-muted-foreground">{description}</p>

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
