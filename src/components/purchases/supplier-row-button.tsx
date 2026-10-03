"use client";

import { Archive, ArchiveRestore } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { supplierRowAction } from "./supplier-actions";

const INTENTS = {
  archive: { label: "Archivar", icon: Archive },
  restore: { label: "Restaurar", icon: ArchiveRestore },
} as const;

export function SupplierRowButton({
  companySlug,
  intent,
  id,
  supplierName,
}: {
  companySlug: string;
  intent: keyof typeof INTENTS;
  id: string;
  supplierName: string;
}) {
  return (
    <RowActionButton
      action={supplierRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={supplierName}
      {...INTENTS[intent]}
    />
  );
}
