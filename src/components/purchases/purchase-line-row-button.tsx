"use client";

import { Trash2 } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { purchaseLineRowAction } from "./purchase-actions";

export function PurchaseLineRowButton({
  companySlug,
  id,
  supplyName,
}: {
  companySlug: string;
  id: string;
  supplyName: string;
}) {
  return (
    <RowActionButton
      action={purchaseLineRowAction}
      companySlug={companySlug}
      intent="remove"
      id={id}
      subject={supplyName}
      label="Quitar"
      icon={Trash2}
      destructive
    />
  );
}
