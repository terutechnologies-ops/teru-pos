import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompanyLogoCard } from "@/components/company/company-logo-card";
import { CompanyProfileForm } from "@/components/company/company-profile-form";
import { toProfileFormValues } from "@/components/company/company-profile-fields";
import { requirePermission } from "@/server/http/staff-session";
import { companyLogoUrl, getCompanyProfile } from "@/server/services/companies";

import { saveSetupProfileAction } from "./actions";

export const metadata: Metadata = { title: "Configuración · Negocio" };

export default async function SetupBusinessPage({
  params,
}: PageProps<"/[empresa]/configuracion-inicial/negocio">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "company.manage");
  const profile = await getCompanyProfile(session);
  if (!profile) notFound();

  return (
    <>
      <div>
        <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
          Configuración inicial
        </span>
        <h1 className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">
          Cuéntanos sobre tu negocio
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Estos datos aparecen en tickets y reportes. La moneda será la base
          para precios y costos.
        </p>
      </div>
      <CompanyLogoCard
        companySlug={profile.slug}
        companyName={profile.name}
        logoUrl={companyLogoUrl(profile.logoPath)}
      />
      <CompanyProfileForm
        mode="setup"
        action={saveSetupProfileAction}
        companySlug={profile.slug}
        initialValues={toProfileFormValues(profile)}
      />
    </>
  );
}
