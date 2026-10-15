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
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      isActive: true,
      totpEnabledAt: true,
    },
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

// Activa o desactiva la cuenta; al desactivar cierra todas sus sesiones (en
// la misma transacción). UNCHANGED si ya estaba así.
export async function setPlatformUserActive(
  email: string,
  isActive: boolean,
  now: Date = new Date(),
): Promise<
  | { status: "OK"; userId: string; revokedSessions: number }
  | { status: "NOT_FOUND" }
  | { status: "UNCHANGED" }
> {
  return db.$transaction(async (tx) => {
    const updated = await tx.platformUser.updateManyAndReturn({
      where: { email, isActive: !isActive },
      data: { isActive },
      select: { id: true },
    });
    if (updated.length === 0) {
      const exists = await tx.platformUser.count({ where: { email } });
      return { status: exists ? "UNCHANGED" : "NOT_FOUND" } as const;
    }
    const userId = updated[0].id;
    let revokedSessions = 0;
    if (!isActive) {
      const revoked = await tx.platformSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      revokedSessions = revoked.count;
    }
    return { status: "OK", userId, revokedSessions } as const;
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
// También las pendientes del segundo paso (mfaVerifiedAt nulo): el servicio
// decide qué puede hacer cada una.
export async function findActivePlatformSession(tokenHash: string, now: Date = new Date()) {
  return db.platformSession.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now }, user: { isActive: true } },
    select: {
      id: true,
      expiresAt: true,
      mfaVerifiedAt: true,
      user: { select: { id: true, name: true, email: true, totpEnabledAt: true } },
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

export async function revokePlatformSessionById(sessionId: string, now: Date = new Date()) {
  await db.platformSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

// --- Verificación en dos pasos ------------------------------------------

export async function findPlatformUserTotp(userId: string) {
  return db.platformUser.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
  });
}

// Clave de una activación pendiente (solo si aún no está activada): así la
// misma clave sirve aunque se recargue la página del QR.
export async function savePendingTotpSecret(userId: string, encryptedSecret: string) {
  const { count } = await db.platformUser.updateMany({
    where: { id: userId, totpEnabledAt: null },
    data: { totpSecret: encryptedSecret },
  });
  return count === 1;
}

export type CompleteMfaResult = "OK" | "CODE_REJECTED" | "SESSION_GONE";

// Cierra el segundo paso en una transacción: acepta el código (o gasta el
// código de respaldo) y verifica la sesión pendiente con su duración normal.
// - enroll: activa la verificación y guarda los códigos de respaldo nuevos.
// - step: el código solo se acepta si es posterior al último (sin repetir,
//   aunque lleguen dos a la vez).
// - recoveryHash: el código de respaldo, si no se había usado.
export async function completePlatformMfa(input: {
  userId: string;
  sessionId: string;
  expiresAt: Date;
  now: Date;
  step?: number;
  recoveryHash?: string;
  enroll?: { recoveryHashes: string[] };
}): Promise<CompleteMfaResult> {
  return db.$transaction(async (tx) => {
    const { userId, now } = input;
    if (input.enroll) {
      const { count } = await tx.platformUser.updateMany({
        where: { id: userId, totpEnabledAt: null, totpSecret: { not: null } },
        data: { totpEnabledAt: now, totpLastStep: input.step },
      });
      if (count === 0) return "CODE_REJECTED";
      await tx.platformRecoveryCode.deleteMany({ where: { userId } });
      await tx.platformRecoveryCode.createMany({
        data: input.enroll.recoveryHashes.map((codeHash) => ({ userId, codeHash })),
      });
    } else if (input.step !== undefined) {
      const { count } = await tx.platformUser.updateMany({
        where: {
          id: userId,
          totpEnabledAt: { not: null },
          OR: [{ totpLastStep: null }, { totpLastStep: { lt: input.step } }],
        },
        data: { totpLastStep: input.step },
      });
      if (count === 0) return "CODE_REJECTED";
    } else if (input.recoveryHash) {
      const { count } = await tx.platformRecoveryCode.updateMany({
        where: { userId, codeHash: input.recoveryHash, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) return "CODE_REJECTED";
    } else {
      return "CODE_REJECTED";
    }

    const { count } = await tx.platformSession.updateMany({
      where: { id: input.sessionId, userId, revokedAt: null, mfaVerifiedAt: null, expiresAt: { gt: now } },
      data: { mfaVerifiedAt: now, expiresAt: input.expiresAt, lastUsedAt: now },
    });
    // Sin sesión no se confirma nada (ni el código ni la activación).
    if (count === 0) throw new SessionGone();
    return "OK";
  }).catch((error: unknown) => {
    if (error instanceof SessionGone) return "SESSION_GONE" as const;
    throw error;
  });
}

class SessionGone extends Error {}

export async function countUnusedRecoveryCodes(userId: string) {
  return db.platformRecoveryCode.count({ where: { userId, usedAt: null } });
}

// Teléfono perdido (script): borra la verificación y los códigos de
// respaldo y cierra todas sus sesiones. null si la cuenta no existe.
export async function resetPlatformUserMfa(
  email: string,
  now: Date = new Date(),
): Promise<{ userId: string; revokedSessions: number } | null> {
  return db.$transaction(async (tx) => {
    const updated = await tx.platformUser.updateManyAndReturn({
      where: { email },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
      select: { id: true },
    });
    if (updated.length === 0) return null;
    const userId = updated[0].id;
    await tx.platformRecoveryCode.deleteMany({ where: { userId } });
    const revoked = await tx.platformSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return { userId, revokedSessions: revoked.count };
  });
}
