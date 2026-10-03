import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateSupplierAction } from "@/components/purchases/supplier-actions";
import { SupplierForm } from "@/components/purchases/supplier-form";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/server/http/staff-session";
import { getSupplier } from "@/server/services/third-parties";

export const metadata: Metadata = { title: "Compras · Editar proveedor" };

export default async function EditSupplierPage({
  params,
}: PageProps<"/[empresa]/compras/proveedores/[id]">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "purchases.manage");
  const supplier = await getSupplier(session, id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Compras · Editar proveedor"
        title={supplier.name}
        description={supplier.isArchived && <Badge variant="secondary">Archivado</Badge>}
      />
      <SupplierForm
        action={updateSupplierAction}
        companySlug={session.company.slug}
        supplierId={supplier.id}
        initialValues={{
          name: supplier.name,
          taxId: supplier.taxId ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
