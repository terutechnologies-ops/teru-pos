import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { StaffRole } from "@/generated/prisma/enums";

// Pendiente = ni aceptada ni revocada (puede estar vencida).
const pending = { acceptedAt: null, revokedAt: null } as const;

function validInvitationWhere(
  tokenHash: string,
  companyId: string,
  now: Date,
) {
  return {
    tokenHash,
    companyId,
    ...pending,
    expiresAt: { gt: now },
    company: { isActive: true },
  };
}

// Crea una invitación y revoca las pendientes del mismo correo en la
// empresa, para que solo el último enlace funcione.
export async function replaceStaffInvitation(params: {
  companyId: string;
  email: string;
  name: string;
  role: StaffRole;
  tokenHash: string;
  expiresAt: Date;
  invitedById: string | null;
  now?: Date;
}) {
  const { now = new Date(), ...data } = params;
  const [, invitation] = await db.$transaction([
    db.staffInvitation.updateMany({
      where: { companyId: data.companyId, email: data.email, ...pending },
      data: { revokedAt: now },
    }),
    db.staffInvitation.create({ data, select: { id: true } }),
  ]);
  return invitation;
}

export async function findValidStaffInvitation(
  tokenHash: string,
  companyId: string,
  now: Date = new Date(),
) {
  return db.staffInvitation.findFirst({
    where: validInvitationWhere(tokenHash, companyId, now),
    select: { id: true, email: true, name: true, role: true, expiresAt: true },
  });
}

export async function listPendingStaffInvitations(companyId: string) {
  return db.staffInvitation.findMany({
    where: { companyId, ...pending },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

// true si estaba pendiente y quedó revocada.
export async function revokeStaffInvitation(
  invitationId: string,
  companyId: string,
  now: Date = new Date(),
) {
  const result = await db.staffInvitation.updateMany({
    where: { id: invitationId, companyId, ...pending },
    data: { revokedAt: now },
  });
  return result.count === 1;
}

export type AcceptStaffInvitationResult =
  | { status: "ACCEPTED"; userId: string }
  | { status: "INVALID" }
  | { status: "EMAIL_TAKEN" };

class InvitationRaceError extends Error {}

// En una transacción: crea el usuario con el rol invitado y consume la
// invitación (solo si sigue pendiente, así dos envíos simultáneos no pueden
// usarla dos veces). Si el correo ya tiene cuenta en la empresa no consume
// nada.
export async function acceptStaffInvitation(params: {
  tokenHash: string;
  companyId: string;
  passwordHash: string;
  now?: Date;
}): Promise<AcceptStaffInvitationResult> {
  const now = params.now ?? new Date();
  try {
    return await db.$transaction(async (tx) => {
      const invitation = await tx.staffInvitation.findFirst({
        where: validInvitationWhere(params.tokenHash, params.companyId, now),
        select: { id: true, email: true, name: true, role: true },
      });
      if (!invitation) return { status: "INVALID" } as const;

      const existing = await tx.user.findUnique({
        where: {
          companyId_email: {
            companyId: params.companyId,
            email: invitation.email,
          },
        },
        select: { id: true },
      });
      if (existing) return { status: "EMAIL_TAKEN" } as const;

      const user = await tx.user.create({
        data: {
          companyId: params.companyId,
          email: invitation.email,
          name: invitation.name,
          role: invitation.role,
          passwordHash: params.passwordHash,
        },
        select: { id: true },
      });
      const consumed = await tx.staffInvitation.updateMany({
        where: { id: invitation.id, ...pending },
        data: { acceptedAt: now, userId: user.id },
      });
      // Otro envío la consumió primero: el throw deshace el usuario creado.
      if (consumed.count !== 1) throw new InvitationRaceError();
      return { status: "ACCEPTED", userId: user.id } as const;
    });
  } catch (error) {
    if (error instanceof InvitationRaceError) return { status: "INVALID" };
    // Carrera con otra aceptación simultánea: la segunda choca con el
    // unique (companyId, email) de users al crear el usuario.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { status: "INVALID" };
    }
    throw error;
  }
}
