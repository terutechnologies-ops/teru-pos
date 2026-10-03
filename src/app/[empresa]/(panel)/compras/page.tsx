import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, PackagePlus, Plus, SearchX } from "lucide-react";

import { PURCHASE_LIST_NOTICES } from "@/components/purchases/purchase-fields";
import { PurchaseDraftList } from "@/components/purchases/purchase-draft-list";
import { PurchaseList } from "@/components/purchases/purchase-list";
import { PurchasesFilters } from "@/components/purchases/purchases-filters";
import { PurchasesSummary } from "@/components/purchases/purchases-summary";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import {
  findPurchaseByNumber,
  getPurchaseDrafts,
  getPurchasesOverview,
  PURCHASES_LIST_LIMIT,
} from "@/server/services/purchases";

export const metadata: Metadata = { title: "Compras" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function PurchasesPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/compras">) {
  const { empresa } = await params;
  const query = await searchParams;
  const notice = PURCHASE_LIST_NOTICES[param(query.aviso) as keyof typeof PURCHASE_LIST_NOTICES];

  const session = await requirePermission(empresa, "purchases.manage");
  const base = `/${session.company.slug}/compras`;

  // "Ir a la compra #N": si existe, directo a su detalle.
  const number = param(query.numero).trim();
  if (number) {
    const purchaseId = await findPurchaseByNumber(session, number);
    if (purchaseId) redirect(`${base}/${purchaseId}`);
  }

  const [{ drafts }, overview] = await Promise.all([
    getPurchaseDrafts(session),
    getPurchasesOverview(session, {
      desde: param(query.desde),
      hasta: param(query.hasta),
      proveedor: param(query.proveedor),
      bodega: param(query.bodega),
      estado: param(query.estado),
    }),
  ]);
  const { filters, dateFormat, currency } = overview;
  const day = (value: string) => formatDate(new Date(`${value}T00:00:00Z`), dateFormat);
  const rangeLabel =
    filters.from === overview.defaultFrom && filters.to === overview.today
      ? "Últimos 30 días"
      : filters.from === filters.to
        ? day(filters.from)
        : `Del ${day(filters.from)} al ${day(filters.to)}`;
  const filtered = Boolean(filters.supplierId || filters.warehouseId || filters.status);
  const newButton = (
    <Button asChild className="h-11 gap-2 px-5">
      <Link href={`${base}/nueva`}>
        <Plus aria-hidden />
        Nueva compra
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Compras"
          title="Compras"
          description="Lo que compras entra al inventario con su costo real al confirmar la compra. Desde el detalle se anula una compra confirmada."
        />
        {newButton}
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {number && (
        <Alert>
          <SearchX />
          <AlertDescription>No existe la compra #{number.replace(/^#/, "")}.</AlertDescription>
        </Alert>
      )}

      {drafts.length > 0 && (
        <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
          <h2 id="drafts-title" className="text-lg font-bold">
            Borradores
          </h2>
          <PurchaseDraftList drafts={drafts} currency={currency} companySlug={session.company.slug} />
        </section>
      )}

      <PurchasesFilters overview={overview} basePath={base} />

      <section aria-labelledby="compras-rango" className="flex flex-col gap-3">
        <h2 id="compras-rango" className="text-lg font-bold">
          {rangeLabel}
        </h2>
        <PurchasesSummary summary={overview.summary} currency={currency} />
      </section>

      {overview.purchases.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PurchaseList overview={overview} basePath={base} />
          {overview.totalCount > PURCHASES_LIST_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Se muestran las {PURCHASES_LIST_LIMIT} más recientes de {overview.totalCount}.
              Acorta el rango de fechas para ver las demás.
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={PackagePlus}
          title={filtered ? "Sin resultados" : "Sin compras"}
          text={
            filtered
              ? "Ninguna compra del rango coincide con los filtros."
              : "No hay compras confirmadas en estas fechas. Registra una con los datos de la factura y sus insumos."
          }
          action={
            filtered ? (
              <Link
                href={`${base}?desde=${filters.from}&hasta=${filters.to}`}
                className="text-sm font-semibold text-link underline"
              >
                Quitar filtros
              </Link>
            ) : (
              newButton
            )
          }
        />
      )}
    </div>
  );
}
