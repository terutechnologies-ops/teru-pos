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

// Para verificar la contraseña actual antes de cambiarla. Solo activos.
export async function findUserPasswordHash(companyId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, companyId, isActive: true },
    select: { passwordHash: true },
  });
  return user?.passwordHash ?? null;
}

// Cambia la contraseña, cierra las demás sesiones de la persona (la actual
// sigue abierta) e invalida los enlaces de recuperación pendientes, todo
// junto. Devuelve cuántas sesiones cerró, o null si la
// persona ya no existe o está inactiva.
export async function changeUserPassword(params: {
  companyId: string;
  userId: string;
  passwordHash: string;
  keepSessionId: string;
  now?: Date;
}): Promise<number | null> {
  const now = params.now ?? new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: params.userId, companyId: params.companyId, isActive: true },
      data: { passwordHash: params.passwordHash },
    });
    if (updated.count !== 1) return null;
    // Un enlace pedido antes del cambio ya no debe servir.
    await tx.userPasswordResetToken.updateMany({
      where: { userId: params.userId, usedAt: null },
      data: { usedAt: now },
    });
    const revoked = await tx.userSession.updateMany({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        revokedAt: null,
        id: { not: params.keepSessionId },
      },
      data: { revokedAt: now },
    });
    return revoked.count;
  });
}

// Nombre y correo para avisarle algo a la persona (p. ej. que su contraseña
// cambió).
export async function findUserContact(companyId: string, userId: string) {
  return db.user.findFirst({
    where: { id: userId, companyId },
    select: { name: true, email: true },
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
