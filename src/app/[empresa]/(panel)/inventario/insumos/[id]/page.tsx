import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateSupplyAction } from "@/components/inventory/supply-actions";
import { SupplyForm } from "@/components/inventory/supply-form";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/server/http/staff-session";
import { getSupply } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Inventario · Editar insumo" };

export default async function EditSupplyPage({
  params,
}: PageProps<"/[empresa]/inventario/insumos/[id]">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "inventory.manage");
  const supply = await getSupply(session, id);
  if (!supply) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Inventario · Editar insumo"
        title={supply.name}
        description={supply.isArchived && <Badge variant="secondary">Archivado</Badge>}
      />
      <SupplyForm
        action={updateSupplyAction}
        companySlug={session.company.slug}
        supplyId={supply.id}
        unitLocked={supply.unitLocked}
        initialValues={{
          name: supply.name,
          unit: supply.unit,
          minStock: supply.minStock ?? "",
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
