import { redirect } from "next/navigation";
import { Clock } from "lucide-react";

import { PosHeader } from "@/components/pos/pos-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { requirePermission } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";
import { companyLogoUrl } from "@/server/services/companies";

import { startsInPos } from "../(panel)/navigation";

// Área operativa (POS): pantalla oscura, sin menú lateral. Entra quien puede
// vender; sin permiso, requirePermission devuelve al panel.
export default async function PosLayout({ children, params }: LayoutProps<"/[empresa]/pos">) {
  const { empresa } = await params;
  const { user, company } = await requirePermission(empresa, "sales.charge");

  // Como en el panel: quien puede terminar la configuración va al asistente;
  // el resto ve un aviso (redirigir al panel formaría un bucle con el cajero).
  if (!company.setupCompletedAt && hasPermission(user.role, "company.manage")) {
    redirect(`/${company.slug}/configuracion-inicial`);
  }

  return (
    <div className="dark flex min-h-svh flex-col bg-background text-foreground">
      <PosHeader
        companySlug={company.slug}
        companyName={company.name}
        logoUrl={companyLogoUrl(company.logoPath)}
        userName={user.name}
        roleLabel={STAFF_ROLE_LABELS[user.role]}
        showPanelLink={!startsInPos(user.role)}
      />
      <main className="flex flex-1 flex-col px-4 py-6 md:px-8">
        {company.setupCompletedAt ? (
          children
        ) : (
          <Alert className="mx-auto max-w-xl">
            <Clock />
            <AlertDescription>
              El propietario aún está configurando la empresa. Podrás vender cuando termine.
            </AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  );
}
