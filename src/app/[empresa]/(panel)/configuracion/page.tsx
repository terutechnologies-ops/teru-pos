import { redirect } from "next/navigation";

import { requireStaffSession } from "@/server/http/staff-session";

import { navHref, navigationFor } from "../navigation";

// /configuracion lleva a la primera sección de configuración que la persona
// puede ver; sin ninguna, al inicio.
export default async function SettingsIndexPage({
  params,
}: PageProps<"/[empresa]/configuracion">) {
  const { empresa } = await params;
  const { user, company } = await requireStaffSession(empresa);
  const first = navigationFor(user.role).find((item) => item.group === "settings");
  redirect(first ? navHref(company.slug, first) : `/${company.slug}`);
}
