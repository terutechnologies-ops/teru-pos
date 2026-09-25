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


class EmailTakenError extends Error {}

// En una transacción: reclama la invitación y crea el usuario con el rol
// invitado. Si el correo ya tiene cuenta en la empresa no consume nada.
export async function acceptStaffInvitation(params: {
  tokenHash: string;
  companyId: string;
  passwordHash: string;
  now?: Date;
}): Promise<AcceptStaffInvitationResult> {
  const now = params.now ?? new Date();
  try {
    return await db.$transaction(async (tx) => {
      // Reclamar antes de crear el usuario: el UPDATE bloquea la fila, así una
      // aceptación simultánea espera a que esta termine y luego ya no la
      // encuentra pendiente (INVALID). Con una lectura previa, que no
      // bloquea, la segunda veía el usuario recién creado como EMAIL_TAKEN.
      const [invitation] = await tx.staffInvitation.updateManyAndReturn({
        where: validInvitationWhere(params.tokenHash, params.companyId, now),
        data: { acceptedAt: now },
        select: { id: true, email: true, name: true, role: true },
      });
      if (!invitation) return { status: "INVALID" } as const;

      try {
        const user = await tx.user.create({
          data: {
            companyId: params.companyId,
            email: invitation.email,
            name: invitation.name,
            role: invitation.role,
            passwordHash: params.passwordHash,
            acceptedInvitation: { connect: { id: invitation.id } },
          },
          select: { id: true },
        });
        return { status: "ACCEPTED", userId: user.id } as const;
      } catch (error) {
        // Unique (companyId, email) de users: el correo ya tenía cuenta. El
        // throw deshace el reclamo para no consumir la invitación.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new EmailTakenError();
        }
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof EmailTakenError) return { status: "EMAIL_TAKEN" };
    throw error;
  }
}
