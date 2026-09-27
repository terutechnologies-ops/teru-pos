import "server-only";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

// Único punto que lee passwordHash; el resultado no debe salir de los
// servicios de autenticación.
export async function findUserCredentialsByEmail(
  companyId: string,
  email: string,
) {
  return db.user.findUnique({
    where: { companyId_email: { companyId, email } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
    },
  });
}

export async function userExistsWithEmail(companyId: string, email: string) {
  const user = await db.user.findUnique({
    where: { companyId_email: { companyId, email } },
    select: { id: true },
  });
  return user !== null;
}

export async function listCompanyMembers(companyId: string) {
  return db.user.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
    },
  });
}

// Activa o desactiva a un miembro (nunca OWNER) cuyo rol esté en `roles`.
// Al desactivar se revocan sus sesiones en la misma transacción. true si
// hubo cambio.
export async function setMemberActive(params: {
  userId: string;
  companyId: string;
  isActive: boolean;
  // Solo cambia a miembros con uno de estos roles (nunca incluye OWNER).
  roles: readonly StaffRole[];
  now?: Date;
}) {
  const { userId, companyId, isActive, roles, now = new Date() } = params;
  return db.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: {
        id: userId,
        companyId,
        role: { in: roles.filter((role) => role !== "OWNER") },
        isActive: !isActive,
      },
      data: { isActive },
    });
    if (result.count !== 1) return false;
    if (!isActive) {
      await tx.userSession.updateMany({
        where: { userId, companyId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    return true;
  });
}

export async function markUserLoggedIn(
  userId: string,
  companyId: string,
  now: Date = new Date(),
) {
  await db.user.updateMany({
    where: { id: userId, companyId },
    data: { lastLoginAt: now },
  });
}
