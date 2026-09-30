import type { InviteField } from "@/server/services/team";

// Compartido entre los formularios (cliente) y sus acciones (servidor).

export type InviteFormValues = Record<InviteField, string>;

export const EMPTY_INVITE: InviteFormValues = { name: "", email: "", role: "STAFF" };

export type InviteFormState = {
  status: "idle" | "sent" | "error";
  message: string | null;
  fieldErrors: Partial<Record<InviteField, string>>;
  values: InviteFormValues;
};

export const TEAM_INTENTS = ["resend", "revoke", "deactivate", "reactivate"] as const;

export type TeamIntent = (typeof TEAM_INTENTS)[number];
