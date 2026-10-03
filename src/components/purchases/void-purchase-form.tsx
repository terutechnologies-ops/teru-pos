"use client";

import { useActionState } from "react";
import { Ban, Loader2 } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { voidPurchaseAction } from "./purchase-actions";
import type { VoidPurchaseFormState } from "./purchase-fields";

const initialState: VoidPurchaseFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  reason: "",
};

// Anular la compra: se despliega (sin JS, con <details>) y pide el motivo;
// el segundo botón es la confirmación.
export function VoidPurchaseForm({
  companySlug,
  purchaseId,
  purchaseNumber,
}: {
  companySlug: string;
  purchaseId: string;
  purchaseNumber: number;
}) {
  const [state, formAction, pending] = useActionState(voidPurchaseAction, initialState);
  const reasonError = state.fieldErrors.reason;

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20 [&::-webkit-details-marker]:hidden">
        <Ban className="size-4" aria-hidden />
        Anular compra
      </summary>

      <form
        action={formAction}
        className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={purchaseId} />

        <p className="text-sm text-muted-foreground">
          La compra queda registrada como anulada y sus insumos salen de la bodega (si ya se
          consumieron, el saldo puede quedar negativo). El costo promedio <strong>no</strong> se
          recalcula: si quedó mal, corrígelo en la ficha del insumo. No se puede deshacer.
        </p>

        {state.message && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.message}
          </p>
        )}

        <FormField name="void-reason" label="Motivo" required error={reasonError}>
          <Input
            id="void-reason"
            name="reason"
            defaultValue={state.reason}
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
            placeholder="Ej: Factura registrada dos veces, el proveedor devolvió el pedido"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? "void-reason-error" : undefined}
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
          Anular la compra #{purchaseNumber}
        </Button>
      </form>
    </details>
  );
}
