import "server-only";

import { redirect } from "next/navigation";

import { requireStaffSession } from "@/server/http/staff-session";
import { hasPermission, type Permission } from "@/server/services/auth/permissions";

// Imprime quien revisa en el panel (reviewPermission) o quien cobra; el
// servicio de cada hoja decide qué registros. "Volver" lleva a la página del
// panel o del POS de donde se suele llegar (rutas sin la empresa).
export async function requirePrintAccess(
  companySlug: string,
  reviewPermission: Permission,
  back: { panel: string; pos: string },
) {
  const session = await requireStaffSession(companySlug);
  const { role } = session.user;
  const slug = session.company.slug;
  const reviews = hasPermission(role, reviewPermission);
  if (!reviews && !hasPermission(role, "sales.charge")) redirect(`/${slug}`);
  return { session, backHref: `/${slug}/${reviews ? back.panel : back.pos}` };
}
