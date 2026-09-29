import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Archive, CircleCheck, History, Pencil, Warehouse } from "lucide-react";

import { MOVEMENT_NOTICES } from "@/components/inventory/movement-fields";
import { SupplyKardex } from "@/components/inventory/supply-kardex";
import { SupplyStock } from "@/components/inventory/supply-stock";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatQuantity, UNIT_INFO } from "@/lib/units";
import { requirePermission } from "@/server/http/staff-session";
import { getSupplyDetail } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Inventario · Insumo" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// Ficha del insumo: existencias por bodega, carga inicial y ajustes, y el
// kardex.
export default async function SupplyDetailPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/inventario/insumos/[id]">) {
  const { empresa, id } = await params;
  const query = await searchParams;
  const warehouseFilter = param(query.bodega);
  const notice = MOVEMENT_NOTICES[param(query.aviso) as keyof typeof MOVEMENT_NOTICES];

  const session = await requirePermission(empresa, "inventory.manage");
  const detail = await getSupplyDetail(session, id, { warehouseId: warehouseFilter });
  if (!detail) notFound();

  const { supply } = detail;
  const list = `/${session.company.slug}/inventario/insumos`;
  const base = `${list}/${supply.id}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={list}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Insumos
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Inventario · Insumo"
          title={supply.name}
          description={
            <span className="flex flex-wrap items-center gap-1.5">
              {UNIT_INFO[supply.unit].label}
              {supply.isArchived && <Badge variant="secondary">Archivado</Badge>}
              {!supply.isArchived && supply.belowMinimum && (
                <Badge variant="destructive">Bajo mínimo</Badge>
              )}
            </span>
          }
        />
        <Button asChild variant="outline" className="h-11 gap-2 px-4">
          <Link href={`${base}/editar`}>
            <Pencil aria-hidden />
            Editar
          </Link>
        </Button>
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {supply.isArchived && (
        <Alert>
          <Archive />
          <AlertDescription>
            Este insumo está archivado: restáuralo desde la lista para registrar movimientos.
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Existencia total</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">
            {formatQuantity(supply.totalStock, supply.unit)}
          </dd>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Stock mínimo</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">
            {supply.minStock === null ? "—" : formatQuantity(supply.minStock, supply.unit)}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Warehouse className="size-5" aria-hidden />}
          title="Existencias por bodega"
          description="Cada bodega empieza con su carga inicial; después, los cambios se registran como ajustes con su motivo."
        />
        <SupplyStock
          detail={detail}
          companySlug={session.company.slug}
          kardexFilter={warehouseFilter}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<History className="size-5" aria-hidden />}
          title="Movimientos"
          description="Historial del insumo: quién hizo cada movimiento, cuándo y el saldo que dejó en la bodega."
        />
        <SupplyKardex detail={detail} basePath={base} warehouseFilter={warehouseFilter} />
      </section>
    </div>
  );
}
