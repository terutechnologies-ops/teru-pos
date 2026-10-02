"use client";

import { useActionState } from "react";
import { Ban, Loader2 } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { voidSaleAction } from "./void-sale-actions";
import type { VoidSaleFormState } from "./void-sale-fields";

const initialState: VoidSaleFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  reason: "",
};

// Anular la venta: se despliega (sin JS, con <details>) y pide el motivo;
// el segundo botón es la confirmación.
export function VoidSaleForm({
  companySlug,
  saleId,
  saleNumber,
}: {
  companySlug: string;
  saleId: string;
  saleNumber: number;
}) {
  const [state, formAction, pending] = useActionState(voidSaleAction, initialState);
  const reasonError = state.fieldErrors.reason;

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20 [&::-webkit-details-marker]:hidden">
        <Ban className="size-4" aria-hidden />
        Anular venta
      </summary>

      <form
        action={formAction}
        className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="saleId" value={saleId} />

        <p className="text-sm text-muted-foreground">
          La venta queda registrada como anulada: lo que descontó del inventario vuelve a la
          bodega y deja de contar en el efectivo esperado del turno. No se puede deshacer.
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
            placeholder="Ej: Cobro duplicado, el cliente no se llevó el pedido"
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
          Anular la venta #{saleNumber}
        </Button>
      </form>
    </details>
  );
}
