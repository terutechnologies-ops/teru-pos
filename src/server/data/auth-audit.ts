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
};

export async function recordAuthEvent(input: AuthEventInput) {
  await db.authAuditLog.create({ data: input });
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

export async function findLatestAuthEventAt(params: {
  action: string;
  actor: { type: ActorType; id: string };
  since: Date;
}): Promise<Date | null> {
  const event = await db.authAuditLog.findFirst({
    where: {
      action: params.action,
      actorType: params.actor.type,
      actorId: params.actor.id,
      createdAt: { gte: params.since },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return event?.createdAt ?? null;
}
