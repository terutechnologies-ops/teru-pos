import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireStaffSession } from "@/server/http/staff-session";

import { navHref, navigationFor } from "./navigation";

export const metadata: Metadata = { title: "Inicio" };

// Inicio del panel: accesos a las secciones que el rol puede usar. Cuando
// existan los módulos de negocio, aquí irá el resumen del día.
export default async function PanelHomePage({ params }: PageProps<"/[empresa]">) {
  const { empresa } = await params;
  const { user, company } = await requireStaffSession(empresa);
  const shortcuts = navigationFor(user.role).filter((item) => item.id !== "home");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
          {company.name}
        </span>
        <h1 className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">
          Hola, {user.name}
        </h1>
      </div>

      {!company.setupCompletedAt && (
        <Alert>
          <Clock />
          <AlertDescription>
            El propietario aún está configurando la empresa. Algunas funciones
            estarán disponibles cuando termine.
          </AlertDescription>
        </Alert>
      )}

      {shortcuts.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={navHref(company.slug, item)}
                  className="group flex h-full items-start gap-3 rounded-xl border-2 border-transparent bg-card p-5 shadow-sm transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-bold">
                      {item.label}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-input bg-card px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Sparkles className="size-6" aria-hidden />
          </span>
          <h2 className="text-lg font-bold">Tus herramientas aparecerán aquí</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Cuando haya módulos disponibles para tu rol, podrás entrar a
            ellos desde esta página y desde el menú.
          </p>
        </div>
      )}
    </div>
  );
}
