"use client";

import { Ban, MailPlus, UserCheck } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { teamRowAction } from "./actions";
import type { TeamIntent } from "./team-fields";

const INTENTS = {
  resend: { label: "Reenviar", icon: MailPlus },
  revoke: { label: "Revocar", icon: Ban, variant: "destructive" },
  deactivate: { label: "Desactivar", icon: Ban, variant: "destructive" },
  reactivate: { label: "Reactivar", icon: UserCheck },
} as const satisfies Record<TeamIntent, object>;

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
  return (
    <RowActionButton
      action={teamRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={subject}
      {...INTENTS[intent]}
    />
  );
}
