import "server-only";

import { db } from "@/lib/db";

// Los tokens no llevan companyId: el aislamiento por empresa se aplica a
// través del usuario dueño del token.

// Crea un token nuevo e invalida los anteriores sin usar del mismo usuario
// (marcándolos como usados), para que solo el último enlace funcione.
export async function replaceUserResetToken(params: {
  userId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  await db.$transaction([
    db.userPasswordResetToken.updateMany({
      where: {
        userId: params.userId,
        usedAt: null,
        user: { companyId: params.companyId },
      },
      data: { usedAt: now },
    }),
    db.userPasswordResetToken.create({
      data: {
        userId: params.userId,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
      },
    }),
  ]);
}

function validTokenWhere(tokenHash: string, companyId: string, now: Date) {
  return {
    tokenHash,
    usedAt: null,
    expiresAt: { gt: now },
    user: { companyId, isActive: true },
  };
}

export async function findValidUserResetToken(
  tokenHash: string,
  companyId: string,
  now: Date = new Date(),
) {
  return db.userPasswordResetToken.findFirst({
    where: validTokenWhere(tokenHash, companyId, now),
    select: { id: true, userId: true, expiresAt: true },
  });
}

// En una transacción: consume el token (solo si sigue válido, así dos envíos
// simultáneos no pueden usarlo dos veces), cambia la contraseña, invalida
// los demás tokens y revoca todas las sesiones del usuario.
// Devuelve el userId, o null si el token no era válido.
export async function resetUserPasswordWithToken(params: {
  tokenHash: string;
  companyId: string;
  passwordHash: string;
  now?: Date;
}): Promise<string | null> {
  const now = params.now ?? new Date();
  return db.$transaction(async (tx) => {
    const token = await tx.userPasswordResetToken.findFirst({
      where: validTokenWhere(params.tokenHash, params.companyId, now),
      select: { id: true, userId: true },
    });
    if (!token) return null;

    const consumed = await tx.userPasswordResetToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return null;

    await tx.user.updateMany({
      where: { id: token.userId, companyId: params.companyId },
      data: { passwordHash: params.passwordHash },
    });
    await tx.userPasswordResetToken.updateMany({
      where: { userId: token.userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.userSession.updateMany({
      where: {
        userId: token.userId,
        companyId: params.companyId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    return token.userId;
  });
}
