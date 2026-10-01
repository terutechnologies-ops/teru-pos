"use client";

import { useActionState } from "react";
import { Loader2, LockOpen, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MoneyField } from "./money-field";
import { openShiftAction } from "./shift-actions";
import { initialShiftState } from "./shift-fields";

// Abre el turno con el fondo inicial. Con una sola sucursal activa no se
// pregunta (el servidor la toma).
export function OpenShiftForm({
  companySlug,
  currency,
  branches,
}: {
  companySlug: string;
  currency: string;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(openShiftAction, initialShiftState);
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

      {branches.length > 1 ? (
        <FormField name="branchId" label="Sucursal" required error={fieldErrors.branchId}>
          <select
            id="branchId"
            name="branchId"
            defaultValue={values.branchId ?? ""}
            required
            aria-invalid={fieldErrors.branchId ? true : undefined}
            aria-describedby={fieldErrors.branchId ? "branchId-error" : undefined}
            className={cn(
              "h-12 w-full min-w-0 rounded-lg border border-input bg-muted px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
          >
            <option value="">Elige la sucursal…</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <input type="hidden" name="branchId" value="" />
      )}

      <MoneyField
        name="openingAmount"
        label="Fondo inicial"
        currency={currency}
        defaultValue={values.openingAmount}
        error={fieldErrors.openingAmount}
        hint="El efectivo con el que empiezas, para dar cambio."
      />

      <Button type="submit" disabled={pending} size="lg" className="h-14 gap-2 text-base font-bold">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LockOpen aria-hidden />}
        Abrir turno
      </Button>
    </form>
  );
}
