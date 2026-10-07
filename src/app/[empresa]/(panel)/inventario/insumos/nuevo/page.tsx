import type { Metadata } from "next";

import { createSupplyAction } from "@/components/inventory/supply-actions";
import { SupplyForm } from "@/components/inventory/supply-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/server/http/staff-session";
import { getInventoryCurrency } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Inventario · Nuevo insumo" };

export default async function NewSupplyPage({
  params,
}: PageProps<"/[empresa]/inventario/insumos/nuevo">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "inventory.manage");
  const currency = await getInventoryCurrency(session);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader eyebrow="Inventario" title="Nuevo insumo" />
      <SupplyForm
        action={createSupplyAction}
        companySlug={session.company.slug}
        currency={currency}
        initialValues={{ name: "", unit: "", minStock: "", idealStock: "", unitCost: "" }}
        submitLabel="Crear insumo"
      />
    </div>
  );
}
