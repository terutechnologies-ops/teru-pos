import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { requireStaffSession } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";
import { companyLogoUrl } from "@/server/services/companies";

import { AppSidebar } from "./app-sidebar";
import { navigationFor, startsInPos } from "./navigation";

// Cookie que escribe el Sidebar de shadcn al abrirlo o cerrarlo.
const SIDEBAR_STATE_COOKIE = "sidebar_state";

// Mientras la empresa no termine su configuración, quien puede hacerla va al
// asistente. El resto entra al panel y ve un aviso (ver la página): así no se
// forma un bucle de redirecciones para quien no tiene acceso al asistente.
export default async function PanelLayout({
  children,
  params,
}: LayoutProps<"/[empresa]">) {
  const { empresa } = await params;
  const { user, company } = await requireStaffSession(empresa);

  if (!company.setupCompletedAt && hasPermission(user.role, "company.manage")) {
    redirect(`/${company.slug}/configuracion-inicial`);
  }
  // El login lleva aquí a todos; el cajero sigue al POS.
  if (startsInPos(user.role)) redirect(`/${company.slug}/pos`);

  const sidebarOpen =
    (await cookies()).get(SIDEBAR_STATE_COOKIE)?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        companySlug={company.slug}
        companyName={company.name}
        logoUrl={companyLogoUrl(company.logoPath)}
        userName={user.name}
        roleLabel={STAFF_ROLE_LABELS[user.role]}
        itemIds={navigationFor(user.role).map((item) => item.id)}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-sm font-semibold md:hidden">
            {company.name}
          </span>
        </header>
        <div className="flex flex-1 flex-col px-4 py-6 md:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
