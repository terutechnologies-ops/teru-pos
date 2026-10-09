import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, TriangleAlert } from "lucide-react";

import { CompanyAccess } from "@/components/platform/company-access";
import { CompanyData, CompanyTeam, CompanyUsage } from "@/components/platform/company-detail";
import { CompanyStatusBadge } from "@/components/platform/company-list";
import { CompanyMark } from "@/components/shared/company-mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePlatformSession } from "@/server/http/platform-session";
import { getPlatformCompany } from "@/server/services/platform/companies";

export const metadata: Metadata = {
  title: "Empresa · Equipo Teru",
  robots: { index: false },
};

const NOTICES: Record<string, { text: string; warning?: boolean }> = {
  creada: { text: "Empresa creada. Enviamos la bienvenida al propietario." },
  "creada-sin-correo": {
    text: "Empresa creada, pero la bienvenida no se pudo enviar. Usa «Reenviar bienvenida» en Equipo.",
    warning: true,
  },
  reenviada: { text: "Bienvenida reenviada con un enlace nuevo. El anterior ya no sirve." },
  desactivada: { text: "Empresa desactivada. Nadie de la empresa puede entrar." },
  reactivada: { text: "Empresa reactivada. Su personal ya puede entrar de nuevo." },
};

// Ficha de una empresa para el equipo Teru: datos, equipo (cuántos por rol)
// y uso. No da acceso al panel de la empresa.
export default async function PlatformCompanyPage({
  params,
  searchParams,
}: PageProps<"/teru/empresas/[id]">) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const { aviso, sesiones } = await searchParams;
  const base = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const closed = Number(sesiones);
  const notice =
    base && aviso === "desactivada" && closed > 0
      ? { ...base, text: `${base.text} Se ${closed === 1 ? "cerró 1 sesión abierta" : `cerraron ${closed} sesiones abiertas`}.` }
      : base;
  const company = await getPlatformCompany(session, id);
  if (!company) notFound();

  return (
    <>
      <Link
        href="/teru"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Empresas
      </Link>
      <div className="flex min-w-0 items-center gap-4">
        <CompanyMark logoUrl={company.logoUrl} companyName={company.name} size="lg" />
        <div className="min-w-0">
          <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">Empresa</span>
          <h1 className="truncate text-[28px] leading-9 font-extrabold tracking-tight">{company.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            /{company.slug}
            <CompanyStatusBadge status={company.status} />
          </div>
        </div>
      </div>
      {notice && (
        <Alert variant={notice.warning ? "destructive" : "default"}>
          {notice.warning ? <TriangleAlert /> : <CircleCheck className="text-success" />}
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      <CompanyUsage company={company} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CompanyData company={company} />
        <CompanyTeam company={company} />
      </div>
      <CompanyAccess
        company={{
          id: company.id,
          name: company.name,
          slug: company.slug,
          deactivation: company.deactivation,
          openShifts: company.openShifts,
          statusChanges: company.statusChanges,
        }}
      />
    </>
  );
}
