import "server-only";

import { recordAuthEvent } from "@/server/data/auth-audit";
import {
  createCompanyWithOwnerInvitation,
  findActiveCompanyBySlug,
} from "@/server/data/companies";
import { getAppUrl } from "@/server/env";
import {
  STAFF_EVENTS,
  STAFF_INVITATION_TTL_MS,
} from "@/server/services/auth/config";
import { generateToken, hashToken } from "@/server/services/auth/tokens";
import { companySlugSchema } from "@/server/validations/auth";
import {
  createCompanySchema,
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
