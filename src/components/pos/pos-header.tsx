import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";

import { logoutAction } from "@/app/[empresa]/(panel)/actions";
import { CompanyMark } from "@/components/shared/company-mark";
import { Button } from "@/components/ui/button";

// Encabezado del POS: empresa, quién atiende, volver al panel (si tiene
// algo allá) y salir.
export function PosHeader({
  companySlug,
  companyName,
  logoUrl,
  userName,
  roleLabel,
  showPanelLink,
}: {
  companySlug: string;
  companyName: string;
  logoUrl: string | null;
  userName: string;
  roleLabel: string;
  showPanelLink: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
      <CompanyMark logoUrl={logoUrl} companyName={companyName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{companyName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {userName} · {roleLabel}
        </p>
      </div>
      {showPanelLink && (
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href={`/${companySlug}`}>
            <LayoutDashboard aria-hidden />
            <span className="hidden sm:inline">Volver al panel</span>
          </Link>
        </Button>
      )}
      <form action={logoutAction.bind(null, companySlug)}>
        <Button type="submit" variant="ghost" size="sm" className="gap-2">
          <LogOut aria-hidden />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </form>
    </header>
  );
}
