import "server-only";

import { db } from "@/lib/db";
import type { ActorType } from "@/generated/prisma/enums";

export type AuthEventInput = {
  companyId: string | null;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  // Elemento afectado, cuando la acción es sobre algo concreto.
  target?: { type: string; id: string };
};

export async function recordAuthEvent({ target, ...input }: AuthEventInput) {
  await db.authAuditLog.create({
    data: { ...input, targetType: target?.type, targetId: target?.id },
  });
}

// Cuenta eventos recientes de una acción por IP o por actor, para el límite
// de intentos. Debe recibir al menos uno de los dos filtros. Con actor se
// filtra también por actorType para usar el índice (actorType, actorId).
export async function countRecentAuthEvents(params: {
  action: string;
  since: Date;
  ipAddress?: string;
  actor?: { type: ActorType; id: string };
}) {
  const { action, since, ipAddress, actor } = params;
  if (!ipAddress && !actor) {
    throw new Error("countRecentAuthEvents requiere ipAddress o actor");
  }
  return db.authAuditLog.count({
    where: {
      action,
      createdAt: { gte: since },
      ...(ipAddress ? { ipAddress } : {}),
      ...(actor ? { actorType: actor.type, actorId: actor.id } : {}),
    },
  });
}

// Último evento de una acción hecha por un actor o sobre un elemento (p. ej.
// el restablecimiento de una cuenta Teru, que hace el script y no la
// persona).
export async function findLatestAuthEventAt(params: {
  action: string;
  since: Date;
} & (
  | { actor: { type: ActorType; id: string }; target?: never }
  | { target: { type: string; id: string }; actor?: never }
)): Promise<Date | null> {
  const { actor, target } = params;
  const event = await db.authAuditLog.findFirst({
    where: {
      action: params.action,
      createdAt: { gte: params.since },
      ...(actor ? { actorType: actor.type, actorId: actor.id } : {}),
      ...(target ? { targetType: target.type, targetId: target.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return event?.createdAt ?? null;
}
