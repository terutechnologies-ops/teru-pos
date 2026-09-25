import "server-only";

import { z } from "zod";

import type { StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import {
  createCompanyWithOwnerInvitation,
  findActiveCompanyBySlug,
  findCompanySettings,
  updateCompanySettings,
} from "@/server/data/companies";
import { getAppUrl } from "@/server/env";
import {
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
  assertPermission(session, "company.setup");
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
  assertPermission(session, "company.setup");
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
