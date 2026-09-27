import { UserPlus, Users } from "lucide-react";

import { SectionTitle } from "@/components/shared/section-title";
import type { TeamOverview } from "@/server/services/team";

import { InviteForm } from "./invite-form";
import { TeamList } from "./team-list";

// Invitar y listar el equipo. Lo usan el asistente y Configuración > Equipo.
export function TeamManager({
  team,
  companySlug,
}: {
  team: TeamOverview;
  companySlug: string;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<UserPlus className="size-5" aria-hidden />}
          title="Nueva invitación"
          description="El enlace vence en 72 horas y sirve una sola vez."
        />
        <InviteForm companySlug={companySlug} roles={team.invitableRoles} />
      </section>

      <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Users className="size-5" aria-hidden />}
          title={`Equipo (${team.members.filter((m) => m.isActive).length})`}
          description="Miembros con cuenta e invitaciones pendientes."
        />
        <TeamList team={team} companySlug={companySlug} />
      </section>
    </div>
  );
}
