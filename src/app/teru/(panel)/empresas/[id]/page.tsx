import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CompanyData, CompanyTeam, CompanyUsage } from "@/components/platform/company-detail";
import { CompanyStatusBadge } from "@/components/platform/company-list";
import { CompanyMark } from "@/components/shared/company-mark";
import { requirePlatformSession } from "@/server/http/platform-session";
import { getPlatformCompany } from "@/server/services/platform/companies";

export const metadata: Metadata = {
  title: "Empresa · Equipo Teru",
  robots: { index: false },
};

// Ficha de una empresa para el equipo Teru: datos, equipo (cuántos por rol)
// y uso. No da acceso al panel de la empresa.
export default async function PlatformCompanyPage({ params }: PageProps<"/teru/empresas/[id]">) {
  const session = await requirePlatformSession();
  const { id } = await params;
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
      <CompanyUsage company={company} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CompanyData company={company} />
        <CompanyTeam company={company} />
      </div>
    </>
  );
}
