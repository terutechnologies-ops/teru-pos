import "server-only";

import { db } from "@/lib/db";

export const MAIN_BRANCH_NAME = "Sede principal";

export async function findActiveCompanyBySlug(slug: string) {
  return db.company.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, slug: true, setupCompletedAt: true },
  });
}

export type CompanySettingsData = {
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  dateFormat: string;
};

export async function findCompanySettings(companyId: string) {
  return db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      slug: true,
      name: true,
      taxId: true,
      phone: true,
      email: true,
      address: true,
      currency: true,
      dateFormat: true,
      setupCompletedAt: true,
    },
  });
}

export async function updateCompanySettings(
  companyId: string,
  data: CompanySettingsData,
) {
  await db.company.update({ where: { id: companyId }, data });
}

// Solo la primera vez: repetirlo no cambia la fecha original.
// true si esta llamada fue la que la marcó.
export async function markCompanySetupCompleted(
  companyId: string,
  now: Date = new Date(),
) {
  const result = await db.company.updateMany({
    where: { id: companyId, setupCompletedAt: null },
    data: { setupCompletedAt: now },
  });
  return result.count === 1;
}

// Alta de una empresa (script de soporte): empresa, sucursal principal e
// invitación para su propietario, todo o nada.
export async function createCompanyWithOwnerInvitation(params: {
  name: string;
  slug: string;
  owner: { name: string; email: string };
  tokenHash: string;
  expiresAt: Date;
}) {
  return db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: params.name, slug: params.slug },
      select: { id: true },
    });
    await tx.branch.create({
      data: { companyId: company.id, name: MAIN_BRANCH_NAME, isMain: true },
    });
    const invitation = await tx.staffInvitation.create({
      data: {
        companyId: company.id,
        email: params.owner.email,
        name: params.owner.name,
        role: "OWNER",
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
      },
      select: { id: true },
    });
    return { companyId: company.id, invitationId: invitation.id };
  });
}
