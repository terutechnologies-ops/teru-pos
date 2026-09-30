import type { ReactNode } from "react";
import { CompanyMark } from "@/components/shared/company-mark";
import { PlatformMark } from "@/components/shared/platform-mark";

// Marco común de las pantallas de acceso (login, recuperación, invitación).
// Misma estructura que la raíz de la plataforma: marco translúcido sobre el
// fondo de marca, tarjeta clara con la identidad de la empresa y tarjeta
// interna con el contenido. Dentro de una empresa va el logo de la empresa
// (o el ícono de tienda), no el logo de Teru POS.
export function AuthShell({
  companyName,
  logoUrl = null,
  icon,
  eyebrow,
  title,
  description,
  footer,
  children,
}: {
  companyName: string;
  logoUrl?: string | null;
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  // Debajo de la tarjeta interna (p. ej. "¿No es tu empresa? Cambiar").
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-brand">
      <div className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-primary/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 size-[30rem] rounded-full bg-primary/25 blur-[140px]" />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[480px] rounded-[28px] border border-white/20 bg-white/10 p-2.5 shadow-2xl backdrop-blur-md sm:p-3">
          <div className="flex flex-col items-center gap-6 rounded-[20px] bg-background px-5 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <CompanyMark logoUrl={logoUrl} companyName={companyName} size="lg" />
              <div>
                <p className="text-3xl font-extrabold tracking-tight">
                  {companyName}
                </p>
                {eyebrow && (
                  <p className="mt-1 text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
                    {eyebrow}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-lg sm:p-6">
              <div className="mb-6 flex flex-col items-center text-center">
                {icon && (
                  <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground [&_svg]:size-6">
                    {icon}
                  </div>
                )}
                <h1 className="text-xl leading-7 font-extrabold">{title}</h1>
                {description && (
                  <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
              {children}
            </div>

            {footer && <div className="text-center text-sm">{footer}</div>}
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-4 pb-6 text-center">
        <PlatformMark />
      </footer>
    </div>
  );
}
