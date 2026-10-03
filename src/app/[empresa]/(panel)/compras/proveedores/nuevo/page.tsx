import type { Metadata } from "next";

import { createSupplierAction } from "@/components/purchases/supplier-actions";
import { SupplierForm } from "@/components/purchases/supplier-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/server/http/staff-session";

export const metadata: Metadata = { title: "Compras · Nuevo proveedor" };

export default async function NewSupplierPage({
  params,
}: PageProps<"/[empresa]/compras/proveedores/nuevo">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "purchases.manage");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader eyebrow="Compras" title="Nuevo proveedor" />
      <SupplierForm
        action={createSupplierAction}
        companySlug={session.company.slug}
        initialValues={{ name: "", taxId: "", phone: "", email: "" }}
        submitLabel="Crear proveedor"
      />
    </div>
  );
}
