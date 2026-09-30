"use client";

import { useActionState } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RowActionState = { error: string | null };

export type RowAction = (prev: RowActionState, formData: FormData) => Promise<RowActionState>;

const initialState: RowActionState = { error: null };

// Botón de una acción sobre una fila (activar, desactivar, archivar...).
// Un formulario por botón: funciona sin JS y cada uno muestra su error. La
// acción recibe company, intent e id.
export function RowActionButton({
  action,
  companySlug,
  intent,
  id,
  label,
  icon: Icon,
  subject,
  variant = "outline",
  iconOnly = false,
  destructive = false,
  disabled,
}: {
  action: RowAction;
  companySlug: string;
  intent: string;
  id: string;
  label: string;
  icon: LucideIcon;
  // Para el lector de pantalla: "Desactivar Congelador".
  subject: string;
  variant?: "outline" | "ghost" | "destructive";
  iconOnly?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

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
        aria-label={`${label} ${subject}`}
        title={iconOnly ? label : undefined}
        className={cn(destructive && "text-destructive hover:text-destructive")}
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
