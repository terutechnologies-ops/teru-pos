"use client";

import { useActionState } from "react";
import {
  Ban,
  Loader2,
  MailPlus,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { teamRowAction } from "./actions";
import type { TeamActionState, TeamIntent } from "./team-fields";

const INTENTS: Record<
  TeamIntent,
  { label: string; icon: LucideIcon; variant: "outline" | "destructive" }
> = {
  resend: { label: "Reenviar", icon: MailPlus, variant: "outline" },
  revoke: { label: "Revocar", icon: Ban, variant: "destructive" },
  deactivate: { label: "Desactivar", icon: Ban, variant: "destructive" },
  reactivate: { label: "Reactivar", icon: UserCheck, variant: "outline" },
};

const initialState: TeamActionState = { error: null };

// Un formulario por botón: funciona sin JS y cada uno muestra su error.
export function RowAction({
  companySlug,
  intent,
  id,
  subject,
}: {
  companySlug: string;
  intent: TeamIntent;
  id: string;
  // Para el lector de pantalla: "Reenviar invitación de Carlos".
  subject: string;
}) {
  const [state, formAction, pending] = useActionState(teamRowAction, initialState);
  const { label, icon: Icon, variant } = INTENTS[intent];

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={variant}
        size="sm"
        disabled={pending}
        aria-label={`${label} ${subject}`}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Icon aria-hidden />
        )}
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
