import type { Metadata } from "next";

import { createCustomerAction } from "@/components/customers/customer-actions";
import { EMPTY_CUSTOMER } from "@/components/customers/customer-fields";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/server/http/staff-session";
import { getCustomerCurrency } from "@/server/services/customers";

export const metadata: Metadata = { title: "Ventas · Nuevo cliente" };

export default async function NewCustomerPage({ params }: PageProps<"/[empresa]/clientes/nuevo">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "customers.manage");
  const currency = await getCustomerCurrency(session);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader eyebrow="Ventas" title="Nuevo cliente" />
      <CustomerForm
        action={createCustomerAction}
        companySlug={session.company.slug}
        currency={currency}
        initialValues={EMPTY_CUSTOMER}
        submitLabel="Crear cliente"
      />
    </div>
  );
}
