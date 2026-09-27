import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, UserPlus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { getTeam, type TeamOverview } from "@/server/services/team";

import { SectionTitle } from "../section-title";
import { InviteForm } from "./invite-form";
import { RowAction } from "./row-action";

export const metadata: Metadata = { title: "Configuración · Equipo" };

export default async function SetupTeamPage({
  params,
}: PageProps<"/[empresa]/configuracion-inicial/equipo">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "team.manage");
  const team = await getTeam(session);
  const slug = session.company.slug;

  return (
    <>
      <div>
        <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
          Configuración inicial
        </span>
        <h1 className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">
          Invita a tu equipo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada persona recibe un enlace por correo para crear su contraseña.
          Puedes hacerlo ahora o más adelante.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<UserPlus className="size-5" aria-hidden />}
            title="Nueva invitación"
            description="El enlace vence en 72 horas y sirve una sola vez."
          />
          <InviteForm companySlug={slug} />
        </section>

        <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Users className="size-5" aria-hidden />}
            title={`Equipo (${team.members.filter((m) => m.isActive).length})`}
            description="Miembros con cuenta e invitaciones pendientes."
          />
          <TeamList team={team} companySlug={slug} />
        </section>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-12 md:px-12">
        <Button asChild variant="outline" className="h-11 gap-2 px-4">
          <Link href={`/${slug}/configuracion-inicial/negocio`}>
            <ArrowLeft aria-hidden />
            Atrás
          </Link>
        </Button>
        <span className="hidden text-sm font-semibold text-muted-foreground sm:inline">
          Paso 2 de 3 · Equipo
        </span>
        <Button asChild className="h-11 gap-2 px-5">
          <Link href={`/${slug}/configuracion-inicial/confirmar`}>
            Continuar
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </>
  );
}

function TeamList({
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
            member.role !== "OWNER" &&
            !member.isSelf && (
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
