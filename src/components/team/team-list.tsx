import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { cn } from "@/lib/utils";
import type { TeamOverview } from "@/server/services/team";

import { RowAction } from "./row-action";

// Miembros con cuenta e invitaciones pendientes. Los botones de cada fila
// solo aparecen si esta persona puede gestionarla (el servicio lo vuelve a
// verificar).
export function TeamList({
  team,
  companySlug,
}: {
  team: TeamOverview;
  companySlug: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {team.members.map((member) => (
        <Row
          key={member.id}
          name={member.name}
          muted={!member.isActive}
          badges={
            <>
              <Badge variant="secondary">{STAFF_ROLE_LABELS[member.role]}</Badge>
              {member.isSelf && <Badge variant="outline">Tú</Badge>}
              {!member.isActive && <Badge variant="destructive">Desactivado</Badge>}
            </>
          }
          detail={member.email}
          action={
            member.canManage && (
              <RowAction
                companySlug={companySlug}
                intent={member.isActive ? "deactivate" : "reactivate"}
                id={member.id}
                subject={`a ${member.name}`}
              />
            )
          }
        />
      ))}

      {team.invitations.map((invitation) => (
        <Row
          key={invitation.id}
          name={invitation.name}
          badges={
            <>
              <Badge variant="secondary">{STAFF_ROLE_LABELS[invitation.role]}</Badge>
              {invitation.expired ? (
                <Badge variant="destructive">Invitación vencida</Badge>
              ) : (
                <Badge className="bg-accent text-accent-foreground">
                  Invitación enviada
                </Badge>
              )}
            </>
          }
          detail={
            invitation.expired
              ? `${invitation.email} · Reenvíala para generar un enlace nuevo`
              : `${invitation.email} · Vence ${timeLeft(invitation.hoursLeft)}`
          }
          action={
            invitation.canManage && (
              <div className="flex flex-wrap justify-end gap-2">
                <RowAction
                  companySlug={companySlug}
                  intent="resend"
                  id={invitation.id}
                  subject={`la invitación de ${invitation.name}`}
                />
                <RowAction
                  companySlug={companySlug}
                  intent="revoke"
                  id={invitation.id}
                  subject={`la invitación de ${invitation.name}`}
                />
              </div>
            )
          }
        />
      ))}

      {team.members.length <= 1 && team.invitations.length === 0 && (
        <li className="py-4 text-sm text-muted-foreground">
          Aún no has invitado a nadie.
        </li>
      )}
    </ul>
  );
}

function Row({
  name,
  badges,
  detail,
  action,
  muted,
}: {
  name: string;
  badges: ReactNode;
  detail: string;
  action?: ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className={cn("flex min-w-0 items-center gap-3", muted && "opacity-60")}>
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground"
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold">{name}</span>
            {badges}
          </div>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      {action && <div className="shrink-0 self-end sm:self-auto">{action}</div>}
    </li>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function timeLeft(hours: number) {
  if (hours < 24) return `en ${hours} h`;
  const days = Math.round(hours / 24);
  return `en ${days} ${days === 1 ? "día" : "días"}`;
}
