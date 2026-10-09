import type { ReactNode } from "react";

import { currencyName, SUPPORTED_TIME_ZONES, type SupportedTimeZone } from "@/lib/company-formats";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import type { StaffRole } from "@/generated/prisma/enums";
import type { PlatformCompanyDetail } from "@/server/services/platform/companies";

import { ResendWelcomeForm } from "./resend-welcome-form";

const ROLE_ORDER: StaffRole[] = ["OWNER", "ADMIN", "CASHIER", "STAFF"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold break-words">{value ?? "—"}</dd>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Indicadores de uso: solo cifras agregadas, nunca el detalle de las ventas.
export function CompanyUsage({ company }: { company: PlatformCompanyDetail }) {
  return (
    <Section title="Uso">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Ventas · 30 días"
          value={company.recentSalesTotal}
          hint={`${company.recentSalesCount} ${company.recentSalesCount === 1 ? "venta" : "ventas"} completadas`}
        />
        <Stat label="Última venta" value={company.lastSaleAt ?? "Ninguna"} />
        <Stat label="Último ingreso" value={company.lastLoginAt ?? "Nadie ha entrado"} hint="Del personal de la empresa" />
        <Stat
          label="Usuarios activos"
          value={String(company.activeUsers)}
          hint={`${company.branches} ${company.branches === 1 ? "sucursal" : "sucursales"}`}
        />
      </div>
    </Section>
  );
}

export function CompanyData({ company }: { company: PlatformCompanyDetail }) {
  const zone = SUPPORTED_TIME_ZONES[company.timeZone as SupportedTimeZone] ?? company.timeZone;
  return (
    <Section title="Datos">
      <dl className="divide-y">
        <Row label="Dirección de acceso" value={`/${company.slug}/login`} />
        <Row label="NIT" value={company.taxId} />
        <Row label="Teléfono" value={company.phone} />
        <Row label="Correo" value={company.email} />
        <Row label="Dirección" value={company.address} />
        <Row label="Moneda" value={`${company.currency} · ${currencyName(company.currency)}`} />
        <Row label="Zona horaria" value={zone} />
        <Row label="Creada" value={company.createdOn} />
        <Row label="Configuración inicial" value={company.setupCompletedAt ? `Completada el ${company.setupCompletedAt}` : "Pendiente"} />
      </dl>
    </Section>
  );
}

// Propietario y cuántas personas hay por rol (sin listar al personal).
export function CompanyTeam({ company }: { company: PlatformCompanyDetail }) {
  const count = (role: StaffRole, isActive: boolean) =>
    company.usersByRole.find((row) => row.role === role && row.isActive === isActive)?.count ?? 0;
  const roles = ROLE_ORDER.filter((role) => count(role, true) + count(role, false) > 0);
  return (
    <Section title="Equipo">
      <dl className="divide-y">
        <Row
          label="Propietario"
          value={
            company.owner ? (
              <>
                {company.owner.name}
                <span className="block font-normal text-muted-foreground">{company.owner.email}</span>
                {!company.owner.isActive && <span className="block text-destructive">Cuenta desactivada</span>}
              </>
            ) : company.ownerInvitation ? (
              <>
                {company.ownerInvitation.name}
                <span className="block font-normal text-muted-foreground">{company.ownerInvitation.email}</span>
                <span
                  className={
                    company.ownerInvitation.expired ? "block text-destructive" : "block font-normal text-muted-foreground"
                  }
                >
                  {company.ownerInvitation.expired
                    ? `Su invitación venció el ${company.ownerInvitation.expiresAt}`
                    : `Invitado, aún sin cuenta · el enlace vence el ${company.ownerInvitation.expiresAt}`}
                </span>
                {company.status !== "INACTIVE" && (
                  <div className="mt-3">
                    <ResendWelcomeForm companyId={company.id} />
                  </div>
                )}
              </>
            ) : (
              "Sin cuenta ni invitación"
            )
          }
        />
        {roles.map((role) => (
          <Row
            key={role}
            label={STAFF_ROLE_LABELS[role]}
            value={`${count(role, true)} ${count(role, true) === 1 ? "activo" : "activos"}${
              count(role, false) > 0 ? ` · ${count(role, false)} desactivados` : ""
            }`}
          />
        ))}
      </dl>
    </Section>
  );
}
