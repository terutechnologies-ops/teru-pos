"use server";

import { refresh } from "next/cache";

import type { RowActionState } from "@/components/shared/row-action-button";
import {
  getRequestContext,
  requirePermission,
} from "@/server/http/staff-session";
import {
  inviteStaffMember,
  resendStaffInvitation,
  revokeInvitation,
  setStaffMemberActive,
  type TeamActionResult,
} from "@/server/services/team";

import {
  EMPTY_INVITE,
  TEAM_INTENTS,
  type InviteFormState,
  type InviteFormValues,
  type TeamIntent,
} from "./team-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

export async function inviteStaffAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field("company"), "team.manage");
  const values: InviteFormValues = {
    name: field("name"),
    email: field("email"),
    role: field("role"),
  };

  let result;
  try {
    result = await inviteStaffMember(session, values, await getRequestContext());
  } catch (error) {
    console.error("inviteStaffAction: error inesperado", (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, values };
  }

  if (!result.ok) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: result.fieldErrors,
      values,
    };
  }

  refresh();
  return {
    status: "sent",
    message: `Invitación enviada a ${values.email.trim().toLowerCase()}.`,
    fieldErrors: {},
    values: { ...EMPTY_INVITE, role: values.role },
  };
}

function isTeamIntent(value: string): value is TeamIntent {
  return (TEAM_INTENTS as readonly string[]).includes(value);
}

// Acciones de cada fila de la lista (invitaciones y miembros).
export async function teamRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const session = await requirePermission(field("company"), "team.manage");
  const intent = field("intent");
  const id = field("id");
  if (!isTeamIntent(intent) || !id) return { error: UNEXPECTED };

  let result: TeamActionResult;
  try {
    const ctx = await getRequestContext();
    switch (intent) {
      case "resend":
        result = await resendStaffInvitation(session, id, ctx);
        break;
      case "revoke":
        result = await revokeInvitation(session, id, ctx);
        break;
      case "deactivate":
      case "reactivate":
        result = await setStaffMemberActive(session, id, intent === "reactivate", ctx);
        break;
    }
  } catch (error) {
    console.error("teamRowAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED };
  }

  refresh();
  return { error: result.ok ? null : result.error };
}
