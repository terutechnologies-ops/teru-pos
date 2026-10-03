"use client";

import { useActionState, type ReactNode } from "react";
import { CircleCheck, Loader2, Trash2 } from "lucide-react";

import type { RowAction, RowActionState } from "@/components/shared/row-action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { confirmPurchaseAction, deletePurchaseAction } from "./purchase-actions";

const initialState: RowActionState = { error: null };

// Acción sobre todo el borrador que se confirma en dos pasos: se despliega
// (sin JS, con <details>) con su explicación y el botón definitivo. Van en
// una fila flex-row-reverse con flex-wrap (Confirmar primero, a la derecha):
// abierto ocupa todo el ancho (open:basis-full) con su recuadro debajo y el
// otro pasa a la línea siguiente. `align` ubica el botón.
function DraftStep({
  action,
  companySlug,
  purchaseId,
  summary,
  explanation,
  submitLabel,
  destructive = false,
  align = "start",
  icon,
}: {
  action: RowAction;
  companySlug: string;
  purchaseId: string;
  summary: string;
  explanation: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  align?: "start" | "end";
  icon: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <details
      className={cn("group open:basis-full", align === "start" && "mr-auto")}
      open={state.error ? true : undefined}
    >
      <summary
        className={cn(
          "flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap [&::-webkit-details-marker]:hidden",
          align === "end" && "ml-auto",
          destructive
            ? "border border-input text-destructive hover:bg-muted"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {icon}
        {summary}
      </summary>
      <form
        action={formAction}
        className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={purchaseId} />
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground">{explanation}</div>
          {state.error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 justify-end">
          <Button
            type="submit"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            className="gap-1.5"
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </details>
  );
}

export function ConfirmPurchaseForm({
  companySlug,
  purchaseId,
  warehouseName,
}: {
  companySlug: string;
  purchaseId: string;
  warehouseName: string;
}) {
  return (
    <DraftStep
      action={confirmPurchaseAction}
      companySlug={companySlug}
      purchaseId={purchaseId}
      summary="Confirmar compra"
      icon={<CircleCheck className="size-4" aria-hidden />}
      explanation={
        <>
          Los insumos entran a <strong className="text-foreground">{warehouseName}</strong> y su
          costo promedio se actualiza con lo pagado. La compra recibe su número y ya no se puede
          cambiar: si hay un error, se anula.
        </>
      }
      submitLabel="Sí, confirmar la compra"
      align="end"
    />
  );
}

export function DeletePurchaseDraftForm({
  companySlug,
  purchaseId,
}: {
  companySlug: string;
  purchaseId: string;
}) {
  return (
    <DraftStep
      action={deletePurchaseAction}
      companySlug={companySlug}
      purchaseId={purchaseId}
      summary="Eliminar borrador"
      icon={<Trash2 className="size-4" aria-hidden />}
      explanation="Se borran el borrador y sus líneas. No afecta el inventario."
      submitLabel="Sí, eliminar el borrador"
      destructive
    />
  );
}
