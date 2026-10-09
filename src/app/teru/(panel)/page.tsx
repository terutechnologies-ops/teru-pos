import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { CompanyList } from "@/components/platform/company-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requirePlatformSession } from "@/server/http/platform-session";
import { getPlatformCompanies, PLATFORM_USAGE_DAYS } from "@/server/services/platform/companies";

export const metadata: Metadata = {
  title: "Empresas · Equipo Teru",
  robots: { index: false },
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// Inicio del panel del equipo Teru: las empresas de la plataforma.
export default async function PlatformHomePage() {
  const session = await requirePlatformSession();
  const { companies, counts } = await getPlatformCompanies(session);

  const summary = [
    plural(counts.active, "activa", "activas"),
    counts.setupPending > 0 && plural(counts.setupPending, "con configuración pendiente", "con configuración pendiente"),
    counts.inactive > 0 && plural(counts.inactive, "desactivada", "desactivadas"),
    `${plural(counts.selling, "vendió", "vendieron")} en los últimos ${PLATFORM_USAGE_DAYS} días`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Empresas"
        description={counts.total > 0 ? summary.join(" · ") : "Las empresas que usan Teru POS."}
      />
      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aún no hay empresas"
          text="Las empresas creadas con npm run company:create aparecerán aquí."
        />
      ) : (
        <CompanyList companies={companies} />
      )}
    </>
  );
}
