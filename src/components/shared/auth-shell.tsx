import type { ReactNode } from "react";
import { Store } from "lucide-react";

// Marco común de las pantallas de acceso (login y recuperación): fondo de
// marca en morado oscuro con brillos morado y lima, y tarjeta clara centrada
// (esquema híbrido de la paleta TERU).
export function AuthShell({
  companyName,
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  companyName: string;
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-brand text-brand-foreground">
      <header className="px-4 pt-6 md:px-12">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
            <Store className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">{companyName}</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="relative w-full max-w-[460px]">
          <div className="pointer-events-none absolute -top-12 -left-12 size-48 rounded-full bg-primary/45 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-52 rounded-full bg-highlight/15 blur-3xl" />

          <div className="relative z-10 rounded-xl bg-card p-6 text-card-foreground shadow-xl sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              {icon && (
                <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
                  {icon}
                </div>
              )}
              {eyebrow && (
                <span className="mb-1 text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
                  {eyebrow}
                </span>
              )}
              <h1 className="mb-2 text-[22px] leading-7 font-extrabold">
                {title}
              </h1>
              {description && (
                <p className="max-w-xs text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
