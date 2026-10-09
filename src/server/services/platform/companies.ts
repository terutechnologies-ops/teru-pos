import "server-only";

import {
  DEFAULT_TIME_ZONE,
  formatCalendarDate,
  formatDateTime,
  formatMoney,
} from "@/lib/company-formats";
import { Prisma } from "@/generated/prisma/client";
import type { RequestContext } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import {
  companyHasOwnerAccount,
  deactivateCompany,
  findCompanyForPlatform,
  findPendingOwnerInvitation,
  findPlatformCompany,
  isCompanySlugTaken,
  listPlatformCompanies,
  reactivateCompany,
  type PlatformCompanyRow,
} from "@/server/data/platform-companies";
import { replaceStaffInvitation } from "@/server/data/staff-invitations";
import { getAppUrl } from "@/server/env";
import { COMPANY_EVENTS, STAFF_EVENTS, STAFF_INVITATION_TTL_MS } from "@/server/services/auth/config";
import { generateToken, hashToken } from "@/server/services/auth/tokens";
import { createCompany } from "@/server/services/companies";
import { publicFileUrl } from "@/server/services/images";
import { sendOwnerWelcome } from "@/server/services/owner-welcome";
import type { PlatformSessionDto } from "@/server/services/platform/auth";
import { createCompanySchema } from "@/server/validations/companies";
import { deactivationReasonSchema } from "@/server/validations/platform";

// Empresas de la plataforma para el panel del equipo Teru. Cada función pide
// la sesión Teru (la página ya la validó; así ningún otro código puede
// llamarlas sin ella). Fechas en la hora de Colombia, donde está el equipo.

export const PLATFORM_USAGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CompanyStatus = "ACTIVE" | "SETUP_PENDING" | "INACTIVE";

function assertPlatformSession(session: PlatformSessionDto) {
  if (!session?.user?.id) throw new Error("Se requiere una sesión del equipo Teru");
}

function when(date: Date | null) {
  return date ? formatDateTime(date, "DD/MM/YYYY", DEFAULT_TIME_ZONE) : null;
}

function toCompanySummary(row: PlatformCompanyRow) {
  const status: CompanyStatus = !row.isActive
    ? "INACTIVE"
    : row.setupCompletedAt
      ? "ACTIVE"
      : "SETUP_PENDING";
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status,
    logoUrl: publicFileUrl(row.logoPath),
    createdOn: formatCalendarDate(row.createdAt, "DD/MM/YYYY", DEFAULT_TIME_ZONE),
    owner: row.owner,
    activeUsers: row.activeUsers,
    recentSalesCount: row.recentSalesCount,
    recentSalesTotal: formatMoney(Number(row.recentSalesTotal), row.currency),
    lastSaleAt: when(row.lastSaleAt),
    lastLoginAt: when(row.lastLoginAt),
  };
}

export type PlatformCompanySummary = ReturnType<typeof toCompanySummary>;

export async function getPlatformCompanies(session: PlatformSessionDto, now = new Date()) {
  assertPlatformSession(session);
  const rows = await listPlatformCompanies(new Date(now.getTime() - PLATFORM_USAGE_DAYS * DAY_MS));
  const companies = rows.map(toCompanySummary);
  return {
    companies,
    counts: {
      total: companies.length,
      active: companies.filter((c) => c.status === "ACTIVE").length,
      setupPending: companies.filter((c) => c.status === "SETUP_PENDING").length,
      inactive: companies.filter((c) => c.status === "INACTIVE").length,
      // Activas con al menos una venta en el período.
      selling: companies.filter((c) => c.status !== "INACTIVE" && c.recentSalesCount > 0).length,
    },
  };
}

export async function getPlatformCompany(
  session: PlatformSessionDto,
  companyId: string,
  now = new Date(),
) {
  assertPlatformSession(session);
  if (!companyId || companyId.length > 64) return null;
  const row = await findPlatformCompany(companyId, new Date(now.getTime() - PLATFORM_USAGE_DAYS * DAY_MS));
  if (!row) return null;
  return {
    ...toCompanySummary(row),
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    address: row.address,
    currency: row.currency,
    timeZone: row.timeZone,
    setupCompletedAt: when(row.setupCompletedAt),
    branches: row.branches,
    usersByRole: row.usersByRole,
    deactivation: row.deactivatedAt
      ? {
          at: when(row.deactivatedAt)!,
          reason: row.deactivationReason ?? "",
          by: row.deactivatedBy?.name ?? null,
        }
      : null,
    // Solo mientras el propietario no haya creado su cuenta.
    ownerInvitation:
      !row.owner && row.ownerInvitation
        ? {
            email: row.ownerInvitation.email,
            name: row.ownerInvitation.name,
            expiresAt: when(row.ownerInvitation.expiresAt)!,
            expired: row.ownerInvitation.expiresAt <= now,
          }
        : null,
  };
}

export type PlatformCompanyDetail = NonNullable<Awaited<ReturnType<typeof getPlatformCompany>>>;

// --- Alta y bienvenida ---------------------------------------------------

export type NewCompanyField = "name" | "slug" | "ownerName" | "ownerEmail";

const FIELD_ERRORS: Record<NewCompanyField, string> = {
  name: "Escribe el nombre de la empresa (2 a 120 caracteres).",
  slug: "Usa minúsculas, números y guiones, sin espacios ni tildes (máximo 64). No puede ser api, dev ni teru.",
  ownerName: "Escribe el nombre del propietario (2 a 120 caracteres).",
  ownerEmail: "Escribe un correo válido.",
};
const SLUG_TAKEN = "Ya existe una empresa con esa dirección.";

export type CreateCompanyFromPanelResult =
  | { ok: true; companyId: string; emailSent: boolean }
  | { ok: false; fieldErrors: Partial<Record<NewCompanyField, string>> };

// Alta desde el panel: mismas reglas y el mismo createCompany que el script
// company:create; la auditoría queda a nombre de la persona del equipo Teru.
// El enlace de la invitación no se devuelve: si la bienvenida no sale, se
// reenvía desde la ficha.
export async function createCompanyFromPanel(
  session: PlatformSessionDto,
  input: Record<NewCompanyField, string>,
  ctx: RequestContext,
): Promise<CreateCompanyFromPanelResult> {
  assertPlatformSession(session);
  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<NewCompanyField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as NewCompanyField;
      if (field in FIELD_ERRORS) fieldErrors[field] = FIELD_ERRORS[field];
    }
    return { ok: false, fieldErrors };
  }
  if (await isCompanySlugTaken(parsed.data.slug)) {
    return { ok: false, fieldErrors: { slug: SLUG_TAKEN } };
  }

  try {
    const result = await createCompany(parsed.data, {
      type: "PLATFORM",
      userId: session.user.id,
      ctx,
    });
    return { ok: true, companyId: result.companyId, emailSent: result.emailSent };
  } catch (error) {
    // Dos altas a la vez con la misma dirección: gana la primera.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fieldErrors: { slug: SLUG_TAKEN } };
    }
    throw error;
  }
}

export type ResendOwnerWelcomeResult = { ok: true } | { ok: false; error: string };

// Nuevo enlace para el propietario que aún no crea su cuenta (el anterior
// deja de servir) y la bienvenida otra vez.
export async function resendOwnerWelcome(
  session: PlatformSessionDto,
  companyId: string,
  ctx: RequestContext,
): Promise<ResendOwnerWelcomeResult> {
  assertPlatformSession(session);
  const company = companyId && companyId.length <= 64 ? await findCompanyForPlatform(companyId) : null;
  if (!company) return { ok: false, error: "Esta empresa no existe." };
  if (!company.isActive) return { ok: false, error: "La empresa está desactivada." };
  if (await companyHasOwnerAccount(company.id)) {
    return { ok: false, error: "El propietario ya creó su cuenta." };
  }
  const invitation = await findPendingOwnerInvitation(company.id);
  if (!invitation) return { ok: false, error: "No hay una invitación del propietario para reenviar." };

  const token = generateToken();
  await replaceStaffInvitation({
    companyId: company.id,
    email: invitation.email,
    name: invitation.name,
    role: "OWNER",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + STAFF_INVITATION_TTL_MS),
    invitedById: null,
  });
  await platformAudit(session, company.id, STAFF_EVENTS.INVITATION_RESENT, ctx);
  const sent = await sendOwnerWelcome({
    companyName: company.name,
    slug: company.slug,
    ownerName: invitation.name,
    ownerEmail: invitation.email,
    invitationUrl: `${getAppUrl()}/${company.slug}/invitacion?token=${token}`,
  });
  return sent
    ? { ok: true }
    : { ok: false, error: "No se pudo enviar el correo. Intenta de nuevo en un momento." };
}

// --- Desactivar y reactivar ------------------------------------------------

export type CompanyStateResult =
  | { ok: true; revokedSessions: number }
  | { ok: false; error: string };

function platformAudit(session: PlatformSessionDto, companyId: string, action: string, ctx: RequestContext) {
  return recordAuthEvent({
    companyId,
    actorType: "PLATFORM",
    actorId: session.user.id,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

const validCompanyId = (id: string) => id.length > 0 && id.length <= 64;

// Con motivo: nadie de la empresa puede volver a entrar y se cierran todas
// sus sesiones. Los datos se conservan.
export async function deactivatePlatformCompany(
  session: PlatformSessionDto,
  companyId: string,
  reasonInput: string,
  ctx: RequestContext,
): Promise<CompanyStateResult> {
  assertPlatformSession(session);
  const reason = deactivationReasonSchema.safeParse(reasonInput);
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };
  if (!validCompanyId(companyId)) return { ok: false, error: "Esta empresa no existe." };

  const result = await deactivateCompany(companyId, { reason: reason.data, byId: session.user.id });
  if (result.status === "NOT_FOUND") return { ok: false, error: "Esta empresa no existe." };
  if (result.status === "UNCHANGED") return { ok: false, error: "La empresa ya estaba desactivada." };
  await platformAudit(session, companyId, COMPANY_EVENTS.DEACTIVATED, ctx);
  return { ok: true, revokedSessions: result.revokedSessions };
}

export async function reactivatePlatformCompany(
  session: PlatformSessionDto,
  companyId: string,
  ctx: RequestContext,
): Promise<CompanyStateResult> {
  assertPlatformSession(session);
  if (!validCompanyId(companyId)) return { ok: false, error: "Esta empresa no existe." };
  const result = await reactivateCompany(companyId);
  if (result.status === "NOT_FOUND") return { ok: false, error: "Esta empresa no existe." };
  if (result.status === "UNCHANGED") return { ok: false, error: "La empresa ya estaba activa." };
  await platformAudit(session, companyId, COMPANY_EVENTS.REACTIVATED, ctx);
  return { ok: true, revokedSessions: 0 };
}
