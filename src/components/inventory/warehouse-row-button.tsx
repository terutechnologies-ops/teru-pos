"use client";

import { Ban, CircleCheck } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { warehouseRowAction } from "./warehouse-actions";

const INTENTS = {
  activate: { label: "Activar", icon: CircleCheck },
  deactivate: { label: "Desactivar", icon: Ban },
} as const;

export function WarehouseRowButton({
  companySlug,
  intent,
  id,
  warehouseName,
}: {
  companySlug: string;
  intent: keyof typeof INTENTS;
  id: string;
  warehouseName: string;
}) {
  return (
    <RowActionButton
      action={warehouseRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={warehouseName}
      {...INTENTS[intent]}
    />
  );
}
