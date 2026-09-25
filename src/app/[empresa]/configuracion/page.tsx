import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";

// Entrada del asistente: lleva al paso en curso. Por ahora siempre es el
// primero; al sumar pasos, aquí se elige el primero sin completar.
export default async function SetupIndexPage({
  params,
}: PageProps<"/[empresa]/configuracion">) {
  const { empresa } = await params;
  const { company } = await requirePermission(empresa, "company.setup");
  redirect(`/${company.slug}/configuracion/negocio`);
}
