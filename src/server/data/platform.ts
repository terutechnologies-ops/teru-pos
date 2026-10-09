import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Cuentas y sesiones del equipo Teru (panel /teru). No pertenecen a ninguna
// empresa: estas tablas no llevan companyId y nada de aquí da acceso a los
// datos de una empresa.

// --- Cuentas -------------------------------------------------------------

export type CreatePlatformUserResult =
  | { status: "OK"; id: string }
  | { status: "EMAIL_TAKEN" };

export async function createPlatformUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<CreatePlatformUserResult> {
  try {
    const user = await db.platformUser.create({ data: input, select: { id: true } });
    return { status: "OK", id: user.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "EMAIL_TAKEN" };
    }
    throw error;
  }
}

// Para el login: incluye el hash, que nunca sale de los servicios.
export async function findPlatformUserCredentials(email: string) {
  return db.platformUser.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, passwordHash: true, isActive: true },
  });
}

export async function markPlatformUserLogin(userId: string, now: Date = new Date()) {
  await db.platformUser.update({ where: { id: userId }, data: { lastLoginAt: now } });
}

// Nueva contraseña y todas sus sesiones cerradas, en una transacción.
// Devuelve la cuenta y cuántas sesiones cerró, o null si no existe.
export async function resetPlatformUserPassword(
  email: string,
  passwordHash: string,
  now: Date = new Date(),
): Promise<{ userId: string; revokedSessions: number } | null> {
  return db.$transaction(async (tx) => {
    const updated = await tx.platformUser.updateManyAndReturn({
      where: { email },
      data: { passwordHash },
      select: { id: true },
    });
    if (updated.length === 0) return null;
    const revoked = await tx.platformSession.updateMany({
      where: { userId: updated[0].id, revokedAt: null },
      data: { revokedAt: now },
    });
    return { userId: updated[0].id, revokedSessions: revoked.count };
  });
}

// --- Sesiones ------------------------------------------------------------

export async function createPlatformSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return db.platformSession.create({ data: input, select: { id: true, expiresAt: true } });
}

// Válida solo si no está revocada ni vencida y la cuenta sigue activa.
export async function findActivePlatformSession(tokenHash: string, now: Date = new Date()) {
  return db.platformSession.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now }, user: { isActive: true } },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export type ActivePlatformSession = NonNullable<
  Awaited<ReturnType<typeof findActivePlatformSession>>
>;

export async function extendPlatformSession(
  sessionId: string,
  expiresAt: Date,
  now: Date = new Date(),
) {
  await db.platformSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { expiresAt, lastUsedAt: now },
  });
}

export async function revokePlatformSession(tokenHash: string, now: Date = new Date()) {
  const result = await db.platformSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count > 0;
}
