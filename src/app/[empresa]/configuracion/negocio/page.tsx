import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import { getCompanyProfile } from "@/server/services/companies";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Configuración · Negocio" };

export default async function SetupBusinessPage({
  params,
}: PageProps<"/[empresa]/configuracion/negocio">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "company.setup");
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
      <ProfileForm
        companySlug={profile.slug}
        initialValues={{
          name: profile.name,
          taxId: profile.taxId ?? "",
          phone: profile.phone ?? "",
          email: profile.email ?? "",
          address: profile.address ?? "",
          currency: profile.currency,
          dateFormat: profile.dateFormat,
        }}
      />
    </>
  );
}
