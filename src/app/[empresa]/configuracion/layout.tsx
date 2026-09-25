import { redirect } from "next/navigation";
import { LogOut, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";

import { logoutAction } from "../(panel)/actions";
import { SetupStepper } from "./setup-stepper";

// Marco del asistente: solo quien puede configurar la empresa y solo
// mientras no esté completa. Cada página y acción vuelve a verificar.
export default async function SetupLayout({
  children,
  params,
}: LayoutProps<"/[empresa]/configuracion">) {
  const { empresa } = await params;
  const { company } = await requirePermission(empresa, "company.setup");

  if (company.setupCompletedAt) redirect(`/${company.slug}`);

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-brand px-4 py-4 text-brand-foreground md:px-12">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
              <Store className="size-5" aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight">
              {company.name}
            </span>
          </div>
          <form action={logoutAction.bind(null, company.slug)}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="gap-2 text-brand-foreground hover:bg-white/10 hover:text-brand-foreground"
            >
              <LogOut aria-hidden />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-12">
        <SetupStepper />
        {children}
      </div>
    </div>
  );
}
