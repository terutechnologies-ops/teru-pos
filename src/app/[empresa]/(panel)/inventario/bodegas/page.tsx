import type { Metadata } from "next";
import { ListTree, PackagePlus } from "lucide-react";

import { NewWarehouseForm } from "@/components/inventory/new-warehouse-form";
import { WarehouseList } from "@/components/inventory/warehouse-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { requirePermission } from "@/server/http/staff-session";
import { getWarehouses } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Inventario · Bodegas" };

export default async function WarehousesPage({
  params,
}: PageProps<"/[empresa]/inventario/bodegas">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "inventory.manage");
  const { groups, branches } = await getWarehouses(session);
  const slug = session.company.slug;
  const total = groups.reduce((sum, group) => sum + group.warehouses.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="Inventario"
        title="Bodegas"
        description="Los lugares donde guardas tus insumos. Cada sucursal tiene una bodega principal y puedes agregar otras (cuarto frío, despensa)."
      />

      {branches.length > 0 && (
        <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<PackagePlus className="size-5" aria-hidden />}
            title="Nueva bodega"
            description={
              branches.length === 1
                ? `Se agrega a ${branches[0].name}.`
                : "Elige la sucursal donde queda."
            }
          />
          <NewWarehouseForm companySlug={slug} branches={branches} />
        </section>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ListTree className="size-5" aria-hidden />}
          title={`Bodegas (${total})`}
          description="Una bodega inactiva no recibe movimientos. La principal no se puede desactivar, ni una bodega con existencias."
        />
        <WarehouseList groups={groups} companySlug={slug} />
      </section>
    </div>
  );
}
