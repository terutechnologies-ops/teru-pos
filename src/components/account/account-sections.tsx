import { KeyRound, UserRound } from "lucide-react";

import { SectionTitle } from "@/components/shared/section-title";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import type { StaffSessionDto } from "@/server/dto/auth";

import { ChangePasswordForm } from "./change-password-form";

// "Mi cuenta": los datos de la persona (solo lectura) y el cambio de
// contraseña. La usan el panel y el POS.
export function AccountSections({ session }: { session: StaffSessionDto }) {
  const { user, company } = session;
  const details = [
    { label: "Nombre", value: user.name },
    { label: "Correo", value: user.email },
    { label: "Rol", value: STAFF_ROLE_LABELS[user.role] },
    { label: "Empresa", value: company.name },
  ];

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<UserRound className="size-5" aria-hidden />}
          title="Tus datos"
          description="Entras al sistema con este correo."
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {details.map((detail) => (
            <div key={detail.label} className="min-w-0">
              <dt className="text-xs font-semibold text-muted-foreground">{detail.label}</dt>
              <dd className="truncate font-medium">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<KeyRound className="size-5" aria-hidden />}
          title="Cambiar contraseña"
          description="Escribe la actual y la nueva dos veces."
        />
        <ChangePasswordForm companySlug={company.slug} />
      </section>
    </>
  );
}
