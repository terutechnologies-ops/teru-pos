"use client";

import { useActionState } from "react";
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  CircleSlash,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { productRowAction } from "./product-actions";
import type { ProductIntent, ProductRowState } from "./product-fields";

const INTENTS: Record<ProductIntent, { label: string; icon: LucideIcon }> = {
  soldout: { label: "Marcar agotado", icon: CircleSlash },
  available: { label: "Disponible", icon: CircleCheck },
  archive: { label: "Archivar", icon: Archive },
  restore: { label: "Restaurar", icon: ArchiveRestore },
};

const initialState: ProductRowState = { error: null };

// Un formulario por botón: funciona sin JS y cada uno muestra su error.
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
  const [state, formAction, pending] = useActionState(productRowAction, initialState);
  const { label, icon: Icon } = INTENTS[intent];

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`${label}: ${productName}`}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
        {label}
      </Button>
      {state.error && (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
