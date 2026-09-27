import "server-only";

import { z } from "zod";

import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import { findMainBranch } from "@/server/data/branches";
import {
  createCompanyWithOwnerInvitation,
  findActiveCompanyBySlug,
  findCompanySettings,
  markCompanySetupCompleted,
  updateCompanySettings,
} from "@/server/data/companies";
import { listPendingStaffInvitations } from "@/server/data/staff-invitations";
import { listCompanyMembers } from "@/server/data/users";
import { getAppUrl } from "@/server/env";
import {
  COMPANY_EVENTS,
  STAFF_EVENTS,
  STAFF_INVITATION_TTL_MS,
} from "@/server/services/auth/config";
import { assertPermission } from "@/server/services/auth/permissions";
import { generateToken, hashToken } from "@/server/services/auth/tokens";
import { companySlugSchema } from "@/server/validations/auth";
import {
  companyProfileSchema,
  createCompanySchema,
  type CompanyProfileInput,
  type CreateCompanyInput,
} from "@/server/validations/companies";

// null si el slug es inválido o la empresa no existe o está inactiva.
export async function getActiveCompanyBySlug(companySlug: string) {
  const slug = companySlugSchema.safeParse(companySlug);
  if (!slug.success) return null;
  return findActiveCompanyBySlug(slug.data);
}

// Crea empresa, sucursal principal e invitación del propietario. Devuelve el
// enlace de la invitación: nunca se guarda ni se registra el token en claro.
export async function createCompany(input: CreateCompanyInput) {
  const data = createCompanySchema.parse(input);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + STAFF_INVITATION_TTL_MS);

  const { companyId } = await createCompanyWithOwnerInvitation({
    name: data.name,
    slug: data.slug,
    owner: { name: data.ownerName, email: data.ownerEmail },
    tokenHash: hashToken(token),
    expiresAt,
  });
  await recordAuthEvent({
    companyId,
    actorType: "SYSTEM",
    actorId: null,
    action: STAFF_EVENTS.INVITATION_CREATED,
  });

  return {
    companyId,
    slug: data.slug,
    expiresAt,
    invitationUrl: `${getAppUrl()}/${data.slug}/invitacion?token=${token}`,
  };
}

export async function getCompanyProfile(session: StaffSessionDto) {
  assertPermission(session, "company.manage");
  return findCompanySettings(session.company.id);
}

export type CompanyProfileField = keyof CompanyProfileInput;

export type SaveCompanyProfileResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<CompanyProfileField, string>> };

// Paso "Negocio" del asistente. Guarda directo en la empresa: si el
// propietario sale y vuelve, retoma con lo que guardó.
export async function saveCompanyProfile(
  session: StaffSessionDto,
  input: CompanyProfileInput,
): Promise<SaveCompanyProfileResult> {
  assertPermission(session, "company.manage");
  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
      ),
    };
  }
  await updateCompanySettings(session.company.id, parsed.data);
  return { ok: true };
}

// Paso "Confirmar" del asistente: lo guardado en los pasos anteriores.
// null si la empresa ya no existe.
export async function getSetupSummary(session: StaffSessionDto, now = new Date()) {
  assertPermission(session, "company.manage");
  const companyId = session.company.id;
  const [profile, mainBranch, members, invitations] = await Promise.all([
    findCompanySettings(companyId),
    findMainBranch(companyId),
    listCompanyMembers(companyId),
    listPendingStaffInvitations(companyId),
  ]);
  if (!profile) return null;
  return {
    profile,
    mainBranch,
    members: members.filter((member) => member.isActive),
    invitations: invitations.map((invitation) => ({
      ...invitation,
      expired: invitation.expiresAt <= now,
    })),
  };
}

export type SetupSummary = NonNullable<Awaited<ReturnType<typeof getSetupSummary>>>;

// Cierra el asistente. Idempotente: si ya estaba completa no cambia la fecha
// ni registra otro evento. Las invitaciones pendientes no lo impiden.
export async function completeCompanySetup(
  session: StaffSessionDto,
  ctx: RequestContext,
) {
  assertPermission(session, "company.manage");
  const marked = await markCompanySetupCompleted(session.company.id);
  if (marked) {
    await recordAuthEvent({
      companyId: session.company.id,
      actorType: "STAFF",
      actorId: session.user.id,
      action: COMPANY_EVENTS.SETUP_COMPLETED,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }
  return { marked };
}
