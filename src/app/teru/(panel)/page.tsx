import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { CompanyList } from "@/components/platform/company-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Plataforma"
          title="Empresas"
          description={counts.total > 0 ? summary.join(" · ") : "Las empresas que usan Teru POS."}
        />
        <Button asChild className="gap-2 font-bold">
          <Link href="/teru/empresas/nueva">
            <Plus aria-hidden />
            Nueva empresa
          </Link>
        </Button>
      </div>
      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aún no hay empresas"
          text="Crea la primera con «Nueva empresa»."
        />
      ) : (
        <CompanyList companies={companies} />
      )}
    </>
  );
}
