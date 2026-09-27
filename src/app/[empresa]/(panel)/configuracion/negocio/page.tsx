import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompanyProfileForm } from "@/components/company/company-profile-form";
import { toProfileFormValues } from "@/components/company/company-profile-fields";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/server/http/staff-session";
import { getCompanyProfile } from "@/server/services/companies";

import { saveCompanySettingsAction } from "./actions";

export const metadata: Metadata = { title: "Configuración · Negocio" };

export default async function BusinessSettingsPage({
  params,
}: PageProps<"/[empresa]/configuracion/negocio">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "company.manage");
  const profile = await getCompanyProfile(session);
  if (!profile) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Configuración"
        title="Datos del negocio"
        description="Identidad comercial, moneda y formatos que aparecen en tickets y reportes."
      />
      <CompanyProfileForm
        mode="settings"
        action={saveCompanySettingsAction}
        companySlug={profile.slug}
        initialValues={toProfileFormValues(profile)}
      />
    </div>
  );
}
