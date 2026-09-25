import { redirect } from "next/navigation";

import { requireStaffSession } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";

// Mientras la empresa no termine su configuración, quien puede hacerla va al
// asistente. El resto entra al panel y ve un aviso (ver la página): así no se
// forma un bucle de redirecciones para quien no tiene acceso al asistente.
export default async function PanelLayout({
  children,
  params,
}: LayoutProps<"/[empresa]">) {
  const { empresa } = await params;
  const { user, company } = await requireStaffSession(empresa);

  if (!company.setupCompletedAt && hasPermission(user.role, "company.setup")) {
    redirect(`/${company.slug}/configuracion`);
  }

  return children;
}
