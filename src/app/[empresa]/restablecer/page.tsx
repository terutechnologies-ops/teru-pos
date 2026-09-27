import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { AuthShell } from "@/components/shared/auth-shell";
import { NewPasswordForm } from "@/components/shared/new-password-form";
import { isStaffResetTokenValid } from "@/server/services/auth/password-reset";
import { getActiveCompanyBySlug } from "@/server/services/companies";
import { PASSWORD_MIN_LENGTH } from "@/server/validations/auth";

import { InvalidLink } from "./invalid-link";
import { resetPasswordAction } from "./actions";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  // El token viaja en la URL: que no se filtre por el Referer.
  referrer: "no-referrer",
};

export default async function ResetPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/restablecer">) {
  const { empresa } = await params;
  const { token } = await searchParams;
  const company = await getActiveCompanyBySlug(empresa);
  if (!company) notFound();

  const tokenValue = typeof token === "string" ? token : "";
  const valid = await isStaffResetTokenValid(company.slug, tokenValue);

  return (
    <AuthShell
      companyName={company.name}
      icon={<LockKeyhole className="size-8" />}
      eyebrow="Acceso seguro"
      title={valid ? "Crea una nueva contraseña" : "Enlace no válido"}
      description={
        valid
          ? "Al guardarla se cerrarán todas tus sesiones abiertas."
          : undefined
      }
    >
      {valid ? (
        <NewPasswordForm
          action={resetPasswordAction}
          companySlug={company.slug}
          token={tokenValue}
          minLength={PASSWORD_MIN_LENGTH}
          passwordLabel="Nueva contraseña"
          submitLabel="Guardar contraseña"
          pendingLabel="Guardando…"
          invalidLink={<InvalidLink companySlug={company.slug} />}
        />
      ) : (
        <InvalidLink companySlug={company.slug} />
      )}
    </AuthShell>
  );
}
