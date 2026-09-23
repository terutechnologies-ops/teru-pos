import "server-only";

import { db } from "@/lib/db";

// Campos que el resto del sistema puede ver de una sesión activa. Nunca
// incluye passwordHash ni tokenHash.
const activeSessionSelect = {
  id: true,
  companyId: true,
  persistent: true,
  expiresAt: true,
  lastUsedAt: true,
  user: {
    select: { id: true, name: true, email: true, role: true },
  },
} as const;

export type ActiveUserSession = NonNullable<
  Awaited<ReturnType<typeof findActiveUserSession>>
>;

export type CreateUserSessionInput = {
  userId: string;
  companyId: string;
  tokenHash: string;
  persistent: boolean;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function createUserSession(input: CreateUserSessionInput) {
  return db.userSession.create({
    data: input,
    select: { id: true, expiresAt: true },
  });
}

// Una sesión es válida solo si pertenece a la empresa de la ruta, no está
// revocada ni vencida, y tanto el usuario como la empresa siguen activos.
export async function findActiveUserSession(
  tokenHash: string,
  companyId: string,
  now: Date = new Date(),
) {
  return db.userSession.findFirst({
    where: {
      tokenHash,
      companyId,
      revokedAt: null,
      expiresAt: { gt: now },
      user: { isActive: true, companyId },
      company: { isActive: true },
    },
    select: activeSessionSelect,
  });
}

export async function extendUserSession(
  sessionId: string,
  companyId: string,
  expiresAt: Date,
  now: Date = new Date(),
) {
  await db.userSession.updateMany({
    where: { id: sessionId, companyId, revokedAt: null },
    data: { expiresAt, lastUsedAt: now },
  });
}

export async function revokeUserSession(
  tokenHash: string,
  companyId: string,
  now: Date = new Date(),
) {
  const result = await db.userSession.updateMany({
    where: { tokenHash, companyId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count > 0;
}

// Se usa al cambiar o restablecer la contraseña.
export async function revokeAllUserSessions(
  userId: string,
  companyId: string,
  now: Date = new Date(),
) {
  const result = await db.userSession.updateMany({
    where: { userId, companyId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}
