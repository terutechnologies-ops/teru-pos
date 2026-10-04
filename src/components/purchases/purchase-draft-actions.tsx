"use client";

import { CircleCheck, Trash2 } from "lucide-react";

import { DraftStep } from "@/components/shared/draft-step";

import { confirmPurchaseAction, deletePurchaseAction } from "./purchase-actions";

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
      id={purchaseId}
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
      id={purchaseId}
      summary="Eliminar borrador"
      icon={<Trash2 className="size-4" aria-hidden />}
      explanation="Se borran el borrador y sus líneas. No afecta el inventario."
      submitLabel="Sí, eliminar el borrador"
      destructive
    />
  );
}
