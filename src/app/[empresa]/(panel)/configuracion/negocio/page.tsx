import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClosingReportCard } from "@/components/company/closing-report-card";
import { CompanyLogoCard } from "@/components/company/company-logo-card";
import { CompanyProfileForm } from "@/components/company/company-profile-form";
import { toProfileFormValues } from "@/components/company/company-profile-fields";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/server/http/staff-session";
import {
  companyLogoUrl,
  getClosingReportRecipients,
  getCompanyProfile,
  getLastClosingReport,
} from "@/server/services/companies";

import { saveCompanySettingsAction } from "./actions";

export const metadata: Metadata = { title: "Configuración · Negocio" };

export default async function BusinessSettingsPage({
  params,
}: PageProps<"/[empresa]/configuracion/negocio">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "company.manage");
  const [profile, reportEmails, lastReport] = await Promise.all([
    getCompanyProfile(session),
    getClosingReportRecipients(session),
    getLastClosingReport(session),
  ]);
  if (!profile) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Configuración"
        title="Datos del negocio"
        description="Identidad comercial, moneda y formatos que aparecen en tickets y reportes."
      />
      <CompanyLogoCard
        companySlug={profile.slug}
        companyName={profile.name}
        logoUrl={companyLogoUrl(profile.logoPath)}
      />
      <ClosingReportCard
        companySlug={profile.slug}
        emails={reportEmails}
        ownEmail={session.user.email}
        lastReport={lastReport}
      />
      <CompanyProfileForm
        mode="settings"
        action={saveCompanySettingsAction}
        companySlug={profile.slug}
        initialValues={toProfileFormValues(profile)}
        currencyLocked={profile.currencyLocked}
      />
    </div>
  );
}
