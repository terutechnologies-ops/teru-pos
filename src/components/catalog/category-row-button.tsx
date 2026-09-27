"use client";

import { useActionState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CircleCheck,
  Loader2,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { categoryRowAction } from "./category-actions";
import type { CategoryIntent, CategoryRowState } from "./category-fields";

const INTENTS: Record<
  CategoryIntent,
  { label: string; icon: LucideIcon; variant: "outline" | "ghost"; iconOnly?: boolean }
> = {
  up: { label: "Subir", icon: ArrowUp, variant: "ghost", iconOnly: true },
  down: { label: "Bajar", icon: ArrowDown, variant: "ghost", iconOnly: true },
  activate: { label: "Activar", icon: CircleCheck, variant: "outline" },
  deactivate: { label: "Desactivar", icon: Ban, variant: "outline" },
  delete: { label: "Eliminar", icon: Trash2, variant: "ghost" },
};

const initialState: CategoryRowState = { error: null };

// Un formulario por botón: funciona sin JS y cada uno muestra su error.
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
  const [state, formAction, pending] = useActionState(categoryRowAction, initialState);
  const { label, icon: Icon, variant, iconOnly } = INTENTS[intent];

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={variant}
        size={iconOnly ? "icon-sm" : "sm"}
        disabled={pending || disabled}
        aria-label={`${label} ${categoryName}`}
        title={iconOnly ? label : undefined}
        className={cn(intent === "delete" && "text-destructive hover:text-destructive")}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
        {!iconOnly && label}
      </Button>
      {state.error && (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
