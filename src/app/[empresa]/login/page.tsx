import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { AuthShell } from "@/components/shared/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCurrentStaffSession } from "@/server/http/staff-session";
import { getRequestCompany } from "@/server/http/company";
import { companyLogoUrl } from "@/server/services/companies";

import { ActiveSession } from "./active-session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/login">) {
  const { empresa } = await params;
  const { restablecida, cuenta } = await searchParams;
  const company = await getRequestCompany(empresa);
  if (!company) notFound();

  const session = await getCurrentStaffSession(company.slug);

  const notice =
    restablecida === "1"
      ? "Tu contraseña se actualizó. Ya puedes iniciar sesión."
      : cuenta === "creada"
        ? "Tu cuenta quedó creada. Ya puedes iniciar sesión."
        : null;

  return (
    <AuthShell
      companyName={company.name}
      logoUrl={companyLogoUrl(company.logoPath)}
      eyebrow="Panel de gestión"
      title={session ? "Ya iniciaste sesión" : "¡Bienvenido de vuelta!"}
      description={
        session
          ? "Continúa con esta cuenta o cierra la sesión para entrar con otra."
          : `Ingresa con tu cuenta de ${company.name} para continuar.`
      }
    >
      {notice && (
        <Alert className="mb-5">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {session ? (
        <ActiveSession companySlug={company.slug} user={session.user} />
      ) : (
        <LoginForm companySlug={company.slug} />
      )}
    </AuthShell>
  );
}
