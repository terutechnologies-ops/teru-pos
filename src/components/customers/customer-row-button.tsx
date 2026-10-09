"use client";

import { Archive, ArchiveRestore } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { customerRowAction } from "./customer-actions";

const INTENTS = {
  archive: { label: "Archivar", icon: Archive },
  restore: { label: "Restaurar", icon: ArchiveRestore },
} as const;

export function CustomerRowButton({
  companySlug,
  intent,
  id,
  customerName,
}: {
  companySlug: string;
  intent: keyof typeof INTENTS;
  id: string;
  customerName: string;
}) {
  return (
    <RowActionButton
      action={customerRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={customerName}
      {...INTENTS[intent]}
    />
  );
}
