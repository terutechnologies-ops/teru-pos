import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateCustomerAction } from "@/components/customers/customer-actions";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { amountInputValue } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { getCustomer } from "@/server/services/customers";

export const metadata: Metadata = { title: "Ventas · Editar cliente" };

export default async function EditCustomerPage({ params }: PageProps<"/[empresa]/clientes/[id]/editar">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "customers.manage");
  const found = await getCustomer(session, id);
  if (!found) notFound();
  const { currency, customer } = found;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Ventas · Editar cliente"
        title={customer.name}
        description={customer.isArchived && <Badge variant="secondary">Archivado</Badge>}
      />
      <CustomerForm
        action={updateCustomerAction}
        companySlug={session.company.slug}
        currency={currency}
        customerId={customer.id}
        initialValues={{
          name: customer.name,
          taxId: customer.taxId ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          creditLimit: amountInputValue(customer.creditLimit, currency),
          creditDays: String(customer.creditDays),
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
