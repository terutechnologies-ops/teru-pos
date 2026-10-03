import "server-only";

import { redirect } from "next/navigation";

import { requireStaffSession } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";

// Imprime quien ve las ventas o quien cobra (el servicio decide qué ventas).
// "Volver" lleva al detalle de la venta en el panel o al POS.
export async function requirePrintAccess(companySlug: string, saleId: string) {
  const session = await requireStaffSession(companySlug);
  const { role } = session.user;
  const slug = session.company.slug;
  const viewsSales = hasPermission(role, "sales.view");
  if (!viewsSales && !hasPermission(role, "sales.charge")) redirect(`/${slug}`);
  return { session, backHref: viewsSales ? `/${slug}/ventas/${saleId}` : `/${slug}/pos` };
}
