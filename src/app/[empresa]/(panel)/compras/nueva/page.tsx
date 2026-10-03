import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck, Warehouse } from "lucide-react";

import { NewPurchaseForm } from "@/components/purchases/purchase-header-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";
import { getPurchaseFormOptions } from "@/server/services/purchases";

export const metadata: Metadata = { title: "Compras · Nueva compra" };

export default async function NewPurchasePage({ params }: PageProps<"/[empresa]/compras/nueva">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "purchases.manage");
  const options = await getPurchaseFormOptions(session);
  const slug = session.company.slug;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader eyebrow="Compras" title="Nueva compra" />
      {options.suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Primero registra un proveedor"
          text="Cada compra se le hace a un proveedor activo."
          action={
            <Button asChild className="h-11 gap-2 px-5">
              <Link href={`/${slug}/compras/proveedores/nuevo`}>
                <Plus aria-hidden />
                Nuevo proveedor
              </Link>
            </Button>
          }
        />
      ) : options.warehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No hay bodegas activas"
          text="La compra entra a una bodega: activa una para poder registrarla."
          action={
            hasPermission(session.user.role, "inventory.manage") && (
              <Button asChild variant="outline" className="h-11 px-5">
                <Link href={`/${slug}/inventario/bodegas`}>Ir a Bodegas</Link>
              </Button>
            )
          }
        />
      ) : (
        <NewPurchaseForm companySlug={slug} options={options} />
      )}
    </div>
  );
}
