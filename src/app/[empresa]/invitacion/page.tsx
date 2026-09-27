import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";

import { AuthShell } from "@/components/shared/auth-shell";
import { NewPasswordForm } from "@/components/shared/new-password-form";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { getActiveCompanyBySlug } from "@/server/services/companies";
import { getInvitationPreview } from "@/server/services/team";
import { PASSWORD_MIN_LENGTH } from "@/server/validations/auth";

import { acceptInvitationAction } from "./actions";
import { InvalidInvitation } from "./invalid-invitation";

export const metadata: Metadata = {
  title: "Invitación al equipo",
  // El token viaja en la URL: que no se filtre por el Referer.
  referrer: "no-referrer",
};

export default async function InvitationPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/invitacion">) {
  const { empresa } = await params;
  const { token } = await searchParams;
  const company = await getActiveCompanyBySlug(empresa);
  if (!company) notFound();

  const tokenValue = typeof token === "string" ? token : "";
  const invitation = await getInvitationPreview(company.slug, tokenValue);
  const invalid = <InvalidInvitation companySlug={company.slug} />;

  return (
    <AuthShell
      companyName={company.name}
      icon={<UserPlus className="size-8" />}
      eyebrow="Invitación al equipo"
      title={invitation ? `¡Hola, ${invitation.name}!` : "Invitación no válida"}
      description={
        invitation
          ? `Te invitaron a ${company.name} como ${STAFF_ROLE_LABELS[invitation.role]}. Crea tu contraseña para activar tu cuenta.`
          : undefined
      }
    >
      {invitation ? (
        <>
          <div className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm">
            <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Tu usuario
            </span>
            <span className="font-semibold break-all">{invitation.email}</span>
          </div>
          <NewPasswordForm
            action={acceptInvitationAction}
            companySlug={company.slug}
            token={tokenValue}
            minLength={PASSWORD_MIN_LENGTH}
            passwordLabel="Crea tu contraseña"
            submitLabel="Crear mi cuenta"
            pendingLabel="Creando cuenta…"
            invalidLink={invalid}
          />
        </>
      ) : (
        invalid
      )}
    </AuthShell>
  );
}
