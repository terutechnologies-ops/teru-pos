import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { CompanyMark } from "@/components/shared/company-mark";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CompanyStatus, PlatformCompanySummary } from "@/server/services/platform/companies";

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  if (status === "INACTIVE") return <Badge variant="destructive">Desactivada</Badge>;
  if (status === "SETUP_PENDING") {
    return <Badge className="bg-accent text-accent-foreground">Configuración pendiente</Badge>;
  }
  return null;
}

// Empresas de la plataforma: cada fila abre su ficha.
export function CompanyList({ companies }: { companies: PlatformCompanySummary[] }) {
  return (
    <ul className="flex flex-col divide-y rounded-2xl border bg-card shadow-sm">
      {companies.map((company) => (
        <li key={company.id}>
          <Link
            href={`/teru/empresas/${company.id}`}
            className="group/fila flex min-w-0 items-center gap-3 p-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CompanyMark
              logoUrl={company.logoUrl}
              companyName={company.name}
              size="sm"
              className={cn(company.status === "INACTIVE" && "opacity-60")}
            />
            <div className={cn("min-w-0 flex-1", company.status === "INACTIVE" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-bold">{company.name}</span>
                <CompanyStatusBadge status={company.status} />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                /{company.slug}
                {company.owner && ` · ${company.owner.name}`}
                {` · ${company.activeUsers} ${company.activeUsers === 1 ? "usuario activo" : "usuarios activos"}`}
                {` · Creada el ${company.createdOn}`}
              </p>
            </div>
            <div className="hidden shrink-0 text-right text-xs sm:block">
              <span className="block text-sm font-bold tabular-nums">{company.recentSalesTotal}</span>
              <span className="block text-muted-foreground tabular-nums">
                {company.recentSalesCount} {company.recentSalesCount === 1 ? "venta" : "ventas"} · 30 días
              </span>
            </div>
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/fila:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
