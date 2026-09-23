import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AuthShell } from "@/components/shared/auth-shell";
import { getCurrentStaffSession } from "@/server/http/staff-session";
import { getActiveCompanyBySlug } from "@/server/services/companies";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  params,
}: PageProps<"/[empresa]/login">) {
  const { empresa } = await params;
  const company = await getActiveCompanyBySlug(empresa);
  if (!company) notFound();

  if (await getCurrentStaffSession(company.slug)) redirect(`/${company.slug}`);

  return (
    <AuthShell
      companyName={company.name}
      eyebrow="Panel de gestión"
      title="¡Bienvenido de vuelta!"
      description={`Ingresa con tu cuenta de ${company.name} para continuar.`}
    >
      <LoginForm companySlug={company.slug} />
    </AuthShell>
  );
}
