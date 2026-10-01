import type { Metadata } from "next";
import { ListOrdered, WalletCards } from "lucide-react";

import { createPaymentMethodAction } from "@/components/payments/payment-method-actions";
import { PaymentMethodList } from "@/components/payments/payment-method-list";
import { NewNameForm } from "@/components/shared/new-name-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { requirePermission } from "@/server/http/staff-session";
import { getPaymentMethods } from "@/server/services/payment-methods";

export const metadata: Metadata = { title: "Configuración · Métodos de pago" };

export default async function PaymentMethodsPage({
  params,
}: PageProps<"/[empresa]/configuracion/pagos">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "payments.manage");
  const methods = await getPaymentMethods(session);
  const slug = session.company.slug;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="Configuración"
        title="Métodos de pago"
        description="Cómo te pagan tus clientes. El orden de esta lista es el orden en que se verán al cobrar."
      />

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<WalletCards className="size-5" aria-hidden />}
          title="Nuevo método de pago"
          description="Se agrega al final de la lista."
        />
        <NewNameForm
          action={createPaymentMethodAction}
          companySlug={slug}
          inputId="new-payment-method"
          placeholder="Ej: Nequi, Daviplata, Bono"
          maxLength={40}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ListOrdered className="size-5" aria-hidden />}
          title={`Métodos de pago (${methods.length})`}
          description="Usa las flechas para ordenarlos. Un método inactivo no se ofrecerá al cobrar; las ventas que ya lo usaron no cambian."
        />
        <PaymentMethodList methods={methods} companySlug={slug} />
      </section>
    </div>
  );
}
