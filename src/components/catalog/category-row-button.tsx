"use client";

import { ArrowDown, ArrowUp, Ban, CircleCheck, Trash2 } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { categoryRowAction } from "./category-actions";
import type { CategoryIntent } from "./category-fields";

const INTENTS = {
  up: { label: "Subir", icon: ArrowUp, variant: "ghost", iconOnly: true },
  down: { label: "Bajar", icon: ArrowDown, variant: "ghost", iconOnly: true },
  activate: { label: "Activar", icon: CircleCheck },
  deactivate: { label: "Desactivar", icon: Ban },
  delete: { label: "Eliminar", icon: Trash2, variant: "ghost", destructive: true },
} as const satisfies Record<CategoryIntent, object>;

export function CategoryRowButton({
  companySlug,
  intent,
  id,
  categoryName,
  disabled,
}: {
  companySlug: string;
  intent: CategoryIntent;
  id: string;
  categoryName: string;
  disabled?: boolean;
}) {
  return (
    <RowActionButton
      action={categoryRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={categoryName}
      disabled={disabled}
      {...INTENTS[intent]}
    />
  );
}
