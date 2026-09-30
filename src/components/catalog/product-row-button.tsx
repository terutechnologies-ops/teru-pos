"use client";

import { Archive, ArchiveRestore, CircleCheck, CircleSlash } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { productRowAction } from "./product-actions";
import type { ProductIntent } from "./product-fields";

const INTENTS = {
  soldout: { label: "Marcar agotado", icon: CircleSlash },
  available: { label: "Disponible", icon: CircleCheck },
  archive: { label: "Archivar", icon: Archive },
  restore: { label: "Restaurar", icon: ArchiveRestore },
} as const satisfies Record<ProductIntent, object>;

export function ProductRowButton({
  companySlug,
  intent,
  id,
  productName,
}: {
  companySlug: string;
  intent: ProductIntent;
  id: string;
  productName: string;
}) {
  return (
    <RowActionButton
      action={productRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={productName}
      {...INTENTS[intent]}
    />
  );
}
