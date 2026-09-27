import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { TeamManager } from "@/components/team/team-manager";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getTeam } from "@/server/services/team";

export const metadata: Metadata = { title: "Configuración · Equipo" };

export default async function SetupTeamPage({
  params,
}: PageProps<"/[empresa]/configuracion-inicial/equipo">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "team.manage");
  const team = await getTeam(session);
  const slug = session.company.slug;

  return (
    <>
      <div>
        <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
          Configuración inicial
        </span>
        <h1 className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">
          Invita a tu equipo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada persona recibe un enlace por correo para crear su contraseña.
          Puedes hacerlo ahora o más adelante.
        </p>
      </div>

      <TeamManager team={team} companySlug={slug} />

      <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-12 md:px-12">
        <Button asChild variant="outline" className="h-11 gap-2 px-4">
          <Link href={`/${slug}/configuracion-inicial/negocio`}>
            <ArrowLeft aria-hidden />
            Atrás
          </Link>
        </Button>
        <span className="hidden text-sm font-semibold text-muted-foreground sm:inline">
          Paso 2 de 3 · Equipo
        </span>
        <Button asChild className="h-11 gap-2 px-5">
          <Link href={`/${slug}/configuracion-inicial/confirmar`}>
            Continuar
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </>
  );
}
