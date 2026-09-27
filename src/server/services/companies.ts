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
  replaceCompanyLogoPath,
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
import {
  publicFileUrl,
  removeFileQuietly,
  replaceImage,
  type ImageResult,
} from "@/server/services/images";
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

// Datos del negocio (asistente y configuración). Guarda directo en la
// empresa: si el propietario sale del asistente, retoma con lo guardado.
// Solo audita si algo cambió; no registra los valores.
export async function saveCompanyProfile(
  session: StaffSessionDto,
  input: CompanyProfileInput,
  ctx: RequestContext,
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
  const current = await findCompanySettings(session.company.id);
  const changed =
    !current ||
    (Object.keys(parsed.data) as CompanyProfileField[]).some(
      (field) => parsed.data[field] !== current[field],
    );
  if (!changed) return { ok: true };

  await updateCompanySettings(session.company.id, parsed.data);
  await recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action: COMPANY_EVENTS.PROFILE_UPDATED,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
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

// --- Logo -------------------------------------------------------------

// URL pública del logo, o null si no hay logo o no hay almacenamiento.
export function companyLogoUrl(logoPath: string | null) {
  return publicFileUrl(logoPath);
}

export type CompanyLogoResult = ImageResult;

function auditCompany(session: StaffSessionDto, action: string, ctx: RequestContext) {
  return recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function updateCompanyLogo(
  session: StaffSessionDto,
  file: Blob | null,
  ctx: RequestContext,
): Promise<CompanyLogoResult> {
  assertPermission(session, "company.manage");
  const result = await replaceImage({
    file,
    pathPrefix: `companies/${session.company.id}/logo`,
    savePath: (path) => replaceCompanyLogoPath(session.company.id, path),
  });
  if (result.ok) await auditCompany(session, COMPANY_EVENTS.LOGO_UPDATED, ctx);
  return result;
}

export async function removeCompanyLogo(
  session: StaffSessionDto,
  ctx: RequestContext,
): Promise<CompanyLogoResult> {
  assertPermission(session, "company.manage");
  const previous = await replaceCompanyLogoPath(session.company.id, null);
  if (!previous) return { ok: true };
  await removeFileQuietly(previous);
  await auditCompany(session, COMPANY_EVENTS.LOGO_REMOVED, ctx);
  return { ok: true };
}
