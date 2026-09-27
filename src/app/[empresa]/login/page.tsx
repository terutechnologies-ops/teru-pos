import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { AuthShell } from "@/components/shared/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCurrentStaffSession } from "@/server/http/staff-session";
import { getActiveCompanyBySlug } from "@/server/services/companies";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/login">) {
  const { empresa } = await params;
  const { restablecida, cuenta } = await searchParams;
  const company = await getActiveCompanyBySlug(empresa);
  if (!company) notFound();

  if (await getCurrentStaffSession(company.slug)) redirect(`/${company.slug}`);

  const notice =
    restablecida === "1"
      ? "Tu contraseña se actualizó. Ya puedes iniciar sesión."
      : cuenta === "creada"
        ? "Tu cuenta quedó creada. Ya puedes iniciar sesión."
        : null;

  return (
    <AuthShell
      companyName={company.name}
      eyebrow="Panel de gestión"
      title="¡Bienvenido de vuelta!"
      description={`Ingresa con tu cuenta de ${company.name} para continuar.`}
    >
      {notice && (
        <Alert className="mb-5">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <LoginForm companySlug={company.slug} />
    </AuthShell>
  );
}
