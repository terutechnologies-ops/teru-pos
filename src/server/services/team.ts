import "server-only";

import { z } from "zod";

import type { StaffRole } from "@/generated/prisma/enums";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import {
  acceptStaffInvitation,
  findPendingStaffInvitation,
  findValidStaffInvitation,
  listPendingStaffInvitations,
  replaceStaffInvitation,
  revokeStaffInvitation,
} from "@/server/data/staff-invitations";
import {
  listCompanyMembers,
  setMemberActive,
  userExistsWithEmail,
} from "@/server/data/users";
import { getAppUrl } from "@/server/env";
import {
  STAFF_EVENTS,
  STAFF_INVITATION_TTL_MS,
} from "@/server/services/auth/config";
import { hashPassword } from "@/server/services/auth/passwords";
import { assertPermission } from "@/server/services/auth/permissions";
import { generateToken, hashToken } from "@/server/services/auth/tokens";
import { getActiveCompanyBySlug } from "@/server/services/companies";
import { getMessageSender } from "@/server/services/messaging";
import { passwordResetSchema } from "@/server/validations/auth";
import {
  staffInvitationSchema,
  type StaffInvitationInput,
} from "@/server/validations/team";

// Gestión del personal: invitaciones y activación de miembros. Todo pasa
// por la empresa de la sesión y el permiso team.manage.

function audit(
  session: StaffSessionDto,
  action: string,
  ctx: RequestContext,
) {
  return recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function getTeam(session: StaffSessionDto, now = new Date()) {
  assertPermission(session, "team.manage");
  const [members, invitations] = await Promise.all([
    listCompanyMembers(session.company.id),
    listPendingStaffInvitations(session.company.id),
  ]);
  return {
    members: members.map((member) => ({
      ...member,
      isSelf: member.id === session.user.id,
    })),
    invitations: invitations.map((invitation) => ({
      ...invitation,
      expired: invitation.expiresAt <= now,
      hoursLeft: Math.max(
        0,
        Math.ceil((invitation.expiresAt.getTime() - now.getTime()) / 3_600_000),
      ),
    })),
  };
}

export type TeamOverview = Awaited<ReturnType<typeof getTeam>>;

// Crea la invitación (reemplazando la pendiente del mismo correo) y envía
// el enlace. El token en claro solo viaja en el mensaje.
async function sendInvitation(
  session: StaffSessionDto,
  invitee: { email: string; name: string; role: StaffRole },
) {
  // Antes de crear nada: sin proveedor de mensajes no quedan invitaciones
  // que nadie recibió.
  const sender = getMessageSender();
  const appUrl = getAppUrl();
  const token = generateToken();

  await replaceStaffInvitation({
    companyId: session.company.id,
    email: invitee.email,
    name: invitee.name,
    role: invitee.role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + STAFF_INVITATION_TTL_MS),
    invitedById: session.user.id,
  });

  const { company, user } = session;
  const hours = STAFF_INVITATION_TTL_MS / 3_600_000;
  await sender.sendEmail({
    to: invitee.email,
    subject: `${user.name} te invitó al equipo de ${company.name}`,
    text: [
      `Hola ${invitee.name},`,
      "",
      `${user.name} te invitó a unirte al equipo de ${company.name} como ${STAFF_ROLE_LABELS[invitee.role]}.`,
      `Abre este enlace para crear tu contraseña (vence en ${hours} horas):`,
      "",
      `${appUrl}/${company.slug}/invitacion?token=${token}`,
      "",
      "Si no esperabas esta invitación, ignora este correo.",
    ].join("\n"),
  });
}

export type InviteField = keyof StaffInvitationInput;

export type InviteStaffResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<InviteField, string>> };

export async function inviteStaffMember(
  session: StaffSessionDto,
  input: StaffInvitationInput,
  ctx: RequestContext,
): Promise<InviteStaffResult> {
  assertPermission(session, "team.manage");
  const parsed = staffInvitationSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
      ),
    };
  }

  // Una invitación para un correo con cuenta nunca se podría aceptar.
  if (await userExistsWithEmail(session.company.id, parsed.data.email)) {
    return {
      ok: false,
      fieldErrors: {
        email:
          "Este correo ya tiene una cuenta en el equipo. Si está desactivada, reactívala desde la lista.",
      },
    };
  }

  await sendInvitation(session, parsed.data);
  await audit(session, STAFF_EVENTS.INVITATION_CREATED, ctx);
  return { ok: true };
}

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const GONE = "La invitación ya no está pendiente. Actualiza la lista.";

// Nuevo enlace con los mismos datos; el anterior deja de funcionar.
export async function resendStaffInvitation(
  session: StaffSessionDto,
  invitationId: string,
  ctx: RequestContext,
): Promise<TeamActionResult> {
  assertPermission(session, "team.manage");
  const invitation = await findPendingStaffInvitation(
    invitationId,
    session.company.id,
  );
  if (!invitation) return { ok: false, error: GONE };

  if (await userExistsWithEmail(session.company.id, invitation.email)) {
    await revokeStaffInvitation(invitation.id, session.company.id);
    return { ok: false, error: "Ese correo ya tiene una cuenta; se revocó la invitación." };
  }

  const { email, name, role } = invitation;
  await sendInvitation(session, { email, name, role });
  await audit(session, STAFF_EVENTS.INVITATION_RESENT, ctx);
  return { ok: true };
}

export async function revokeInvitation(
  session: StaffSessionDto,
  invitationId: string,
  ctx: RequestContext,
): Promise<TeamActionResult> {
  assertPermission(session, "team.manage");
  const revoked = await revokeStaffInvitation(invitationId, session.company.id);
  if (!revoked) return { ok: false, error: GONE };
  await audit(session, STAFF_EVENTS.INVITATION_REVOKED, ctx);
  return { ok: true };
}

// El OWNER y uno mismo quedan fuera: nadie puede dejar la empresa sin
// propietario ni bloquearse solo.
export async function setStaffMemberActive(
  session: StaffSessionDto,
  userId: string,
  isActive: boolean,
  ctx: RequestContext,
): Promise<TeamActionResult> {
  assertPermission(session, "team.manage");
  if (userId === session.user.id) {
    return { ok: false, error: "No puedes cambiar el estado de tu propia cuenta." };
  }
  const changed = await setMemberActive({
    userId,
    companyId: session.company.id,
    isActive,
  });
  if (!changed) {
    return { ok: false, error: "No se pudo cambiar el estado de este miembro." };
  }
  await audit(
    session,
    isActive ? STAFF_EVENTS.MEMBER_REACTIVATED : STAFF_EVENTS.MEMBER_DEACTIVATED,
    ctx,
  );
  return { ok: true };
}

// --- Aceptación (pública, con el token del enlace) ----------------------

export async function getInvitationPreview(companySlug: string, token: string) {
  if (!token) return null;
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return null;
  const invitation = await findValidStaffInvitation(hashToken(token), company.id);
  if (!invitation) return null;
  return { name: invitation.name, email: invitation.email, role: invitation.role };
}

export type AcceptInvitationResult =
  | { ok: true; companySlug: string }
  | {
      ok: false;
      error: "INVALID_INPUT";
      fieldErrors: { password?: string; confirmPassword?: string };
    }
  | { ok: false; error: "INVALID_TOKEN" }
  | { ok: false; error: "EMAIL_TAKEN" };

export async function acceptInvitation(
  companySlug: string,
  rawInput: unknown,
  ctx: RequestContext,
): Promise<AcceptInvitationResult> {
  // Mismas reglas que al restablecer: token del enlace + contraseña nueva.
  const input = passwordResetSchema.safeParse(rawInput);
  if (!input.success) {
    const { fieldErrors } = z.flattenError(input.error);
    if (fieldErrors.token) return { ok: false, error: "INVALID_TOKEN" };
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: {
        password: fieldErrors.password?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0],
      },
    };
  }

  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { ok: false, error: "INVALID_TOKEN" };

  // Hash fuera de la transacción: argon2 tarda y no debe retener la conexión.
  const passwordHash = await hashPassword(input.data.password);
  const result = await acceptStaffInvitation({
    tokenHash: hashToken(input.data.token),
    companyId: company.id,
    passwordHash,
  });
  if (result.status === "INVALID") return { ok: false, error: "INVALID_TOKEN" };
  if (result.status === "EMAIL_TAKEN") return { ok: false, error: "EMAIL_TAKEN" };

  await recordAuthEvent({
    companyId: company.id,
    actorType: "STAFF",
    actorId: result.userId,
    action: STAFF_EVENTS.INVITATION_ACCEPTED,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  return { ok: true, companySlug: company.slug };
}
