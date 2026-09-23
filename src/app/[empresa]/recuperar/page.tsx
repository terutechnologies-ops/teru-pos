import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KeyRound } from "lucide-react";

import { AuthShell } from "@/components/shared/auth-shell";
import { getActiveCompanyBySlug } from "@/server/services/companies";

import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default async function RecoverPage({
  params,
}: PageProps<"/[empresa]/recuperar">) {
  const { empresa } = await params;
  const company = await getActiveCompanyBySlug(empresa);
  if (!company) notFound();

  return (
    <AuthShell
      companyName={company.name}
      icon={<KeyRound className="size-8" />}
      eyebrow="Acceso seguro"
      title="¿Problemas para ingresar?"
      description="Ingresa tu correo registrado y te enviaremos un enlace para restablecer tu contraseña."
    >
      <RecoverForm companySlug={company.slug} />
    </AuthShell>
  );
}
