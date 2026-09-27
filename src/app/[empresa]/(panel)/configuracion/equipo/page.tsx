import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { TeamManager } from "@/components/team/team-manager";
import { requirePermission } from "@/server/http/staff-session";
import { getTeam } from "@/server/services/team";

export const metadata: Metadata = { title: "Configuración · Equipo" };

export default async function TeamSettingsPage({
  params,
}: PageProps<"/[empresa]/configuracion/equipo">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "team.manage");
  const team = await getTeam(session);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Configuración"
        title="Equipo"
        description="Invita a tu personal y administra quién tiene acceso. Cada persona recibe un enlace por correo para crear su contraseña."
      />
      <TeamManager team={team} companySlug={session.company.slug} />
    </div>
  );
}
