import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  PartyPopper,
  Pencil,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currencyName,
  formatDate,
  formatMoney,
  isDateFormat,
} from "@/lib/company-formats";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { requirePermission } from "@/server/http/staff-session";
import { getSetupSummary, type SetupSummary } from "@/server/services/companies";

import { SectionTitle } from "../section-title";
import { FinishSetupForm } from "./finish-form";

export const metadata: Metadata = { title: "Configuración · Confirmar" };

// Mismos ejemplos que la vista previa del paso Negocio.
const SAMPLE_DATE = new Date(Date.UTC(2026, 2, 24));
const SAMPLE_PRICE = 16500;

export default async function SetupConfirmPage({
  params,
}: PageProps<"/[empresa]/configuracion/confirmar">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "company.setup");
  const summary = await getSetupSummary(session);
  if (!summary) notFound();
  const slug = session.company.slug;

  return (
    <>
      <div>
        <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
          Configuración inicial
        </span>
        <h1 className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">
          Revisa y confirma
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Así quedará configurada tu empresa. Si algo no está bien, vuelve al
          paso correspondiente antes de finalizar.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <BusinessCard summary={summary} editHref={`/${slug}/configuracion/negocio`} />
        <div className="flex min-w-0 flex-col gap-6">
          <BranchCard summary={summary} editHref={`/${slug}/configuracion/negocio`} />
          <TeamCard summary={summary} editHref={`/${slug}/configuracion/equipo`} />
        </div>
      </div>

      <section className="flex items-start gap-4 rounded-xl bg-brand p-5 text-brand-foreground sm:p-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
          <PartyPopper className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold">Todo listo</h2>
          <p className="text-sm text-brand-muted-foreground">
            Al finalizar, tu equipo podrá empezar a usar {summary.profile.name}.
            {summary.invitations.length > 0 &&
              " Las invitaciones pendientes siguen vigentes y se pueden aceptar después."}
          </p>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-12 md:px-12">
        <Button asChild variant="outline" className="h-11 gap-2 px-4">
          <Link href={`/${slug}/configuracion/equipo`}>
            <ArrowLeft aria-hidden />
            Atrás
          </Link>
        </Button>
        <span className="hidden text-sm font-semibold text-muted-foreground md:inline">
          Paso 3 de 3 · Confirmar
        </span>
        <FinishSetupForm companySlug={slug} />
      </div>
    </>
  );
}

function BusinessCard({
  summary: { profile },
  editHref,
}: {
  summary: SetupSummary;
  editHref: string;
}) {
  return (
    <SummaryCard
      icon={<BadgeCheck className="size-5" aria-hidden />}
      title="Negocio"
      description="Identidad comercial, moneda y formatos."
      editHref={editHref}
      editLabel="Editar los datos del negocio"
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label="Nombre comercial" value={profile.name} wide />
        <Item label="NIT o identificación fiscal" value={profile.taxId} />
        <Item label="Teléfono" value={profile.phone} />
        <Item label="Correo administrativo" value={profile.email} wide />
        <Item
          label="Moneda"
          value={`${profile.currency} · ${currencyName(profile.currency)}`}
        />
        <Item label="Formato de fecha" value={profile.dateFormat} />
      </dl>
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-dashed border-input bg-muted/60 p-4">
        <span className="text-xl font-extrabold text-link">
          {formatMoney(SAMPLE_PRICE, profile.currency)}
        </span>
        <span className="text-sm font-semibold text-muted-foreground">
          {isDateFormat(profile.dateFormat)
            ? formatDate(SAMPLE_DATE, profile.dateFormat)
            : profile.dateFormat}
        </span>
      </div>
    </SummaryCard>
  );
}

function BranchCard({
  summary: { profile, mainBranch },
  editHref,
}: {
  summary: SetupSummary;
  editHref: string;
}) {
  return (
    <SummaryCard
      icon={<MapPin className="size-5" aria-hidden />}
      title={mainBranch?.name ?? "Sede principal"}
      description="Sede principal de la empresa."
      editHref={editHref}
      editLabel="Editar la dirección de la sede principal"
    >
      <dl>
        {/* La dirección se captura en el paso Negocio. */}
        <Item label="Dirección" value={profile.address} />
      </dl>
    </SummaryCard>
  );
}

function TeamCard({
  summary: { members, invitations },
  editHref,
}: {
  summary: SetupSummary;
  editHref: string;
}) {
  const pending =
    invitations.length === 1
      ? "1 invitación pendiente"
      : `${invitations.length} invitaciones pendientes`;
  return (
    <SummaryCard
      icon={<Users className="size-5" aria-hidden />}
      title={`Equipo (${members.length})`}
      description={
        invitations.length === 0
          ? "Miembros activos."
          : `Miembros activos y ${pending}.`
      }
      editHref={editHref}
      editLabel="Editar el equipo"
    >
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold">{member.name}</span>
            <Badge variant="secondary">{STAFF_ROLE_LABELS[member.role]}</Badge>
          </li>
        ))}
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-muted-foreground">{invitation.name}</span>
            <Badge variant="secondary">{STAFF_ROLE_LABELS[invitation.role]}</Badge>
            {invitation.expired ? (
              <Badge variant="destructive">Invitación vencida</Badge>
            ) : (
              <Badge className="bg-accent text-accent-foreground">
                Invitación enviada
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}

function SummaryCard({
  icon,
  title,
  description,
  editHref,
  editLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  editHref: string;
  editLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
      <SectionTitle
        icon={icon}
        title={title}
        description={description}
        action={
          <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1.5 text-link">
            <Link href={editHref} aria-label={editLabel}>
              <Pencil aria-hidden />
              Editar
            </Link>
          </Button>
        }
      />
      {children}
    </section>
  );
}

function Item({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={
          value ? "text-sm font-semibold break-words" : "text-sm text-muted-foreground"
        }
      >
        {value || "Sin registrar"}
      </dd>
    </div>
  );
}
