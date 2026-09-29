"use client";

import { Archive, ArchiveRestore } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { supplyRowAction } from "./supply-actions";

const INTENTS = {
  archive: { label: "Archivar", icon: Archive },
  restore: { label: "Restaurar", icon: ArchiveRestore },
} as const;

export function SupplyRowButton({
  companySlug,
  intent,
  id,
  supplyName,
}: {
  companySlug: string;
  intent: keyof typeof INTENTS;
  id: string;
  supplyName: string;
}) {
  return (
    <RowActionButton
      action={supplyRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={supplyName}
      {...INTENTS[intent]}
    />
  );
}
