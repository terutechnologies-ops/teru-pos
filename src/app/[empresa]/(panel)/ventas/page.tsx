import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt, SearchX } from "lucide-react";

import { SaleList } from "@/components/sales/sale-list";
import { SalesFilters } from "@/components/sales/sales-filters";
import { SalesSummary } from "@/components/sales/sales-summary";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { findSaleByNumber, getSalesOverview, SALES_LIST_LIMIT } from "@/server/services/sales";

export const metadata: Metadata = { title: "Ventas" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function SalesPage({ params, searchParams }: PageProps<"/[empresa]/ventas">) {
  const { empresa } = await params;
  const query = await searchParams;
  const session = await requirePermission(empresa, "sales.view");
  const base = `/${session.company.slug}/ventas`;

  // "Ir a la venta #N": si existe, directo a su detalle.
  const number = param(query.numero).trim();
  if (number) {
    const saleId = await findSaleByNumber(session, number);
    if (saleId) redirect(`${base}/${saleId}`);
  }

  const overview = await getSalesOverview(session, {
    desde: param(query.desde),
    hasta: param(query.hasta),
    cajero: param(query.cajero),
    sucursal: param(query.sucursal),
    estado: param(query.estado),
  });
  const { filters, dateFormat } = overview;
  const day = (value: string) => formatDate(new Date(`${value}T00:00:00Z`), dateFormat);
  const rangeLabel =
    filters.from === filters.to
      ? filters.from === overview.today
        ? `Hoy, ${day(filters.from)}`
        : day(filters.from)
      : `Del ${day(filters.from)} al ${day(filters.to)}`;
  const filtered = Boolean(filters.cashierId || filters.branchId || filters.status);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Ventas"
        title="Ventas"
        description="Lo vendido en el punto de venta, con su detalle. Desde el detalle se anula una venta mientras su turno siga abierto."
      />

      {number && (
        <Alert>
          <SearchX />
          <AlertDescription>
            No existe la venta #{number.replace(/^#/, "")}.
          </AlertDescription>
        </Alert>
      )}

      <SalesFilters overview={overview} basePath={base} />

      <section aria-labelledby="ventas-rango" className="flex flex-col gap-3">
        <h2 id="ventas-rango" className="text-lg font-bold">
          {rangeLabel}
        </h2>
        <SalesSummary summary={overview.summary} currency={overview.currency} />
      </section>

      {overview.sales.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SaleList overview={overview} basePath={base} />
          {overview.totalCount > SALES_LIST_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Se muestran las {SALES_LIST_LIMIT} más recientes de {overview.totalCount}. Acorta
              el rango de fechas para ver las demás.
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Receipt}
          title={filtered ? "Sin resultados" : "Sin ventas"}
          text={
            filtered
              ? "Ninguna venta del rango coincide con los filtros."
              : "No hay ventas registradas en estas fechas."
          }
          action={
            filtered ? (
              <Link
                href={`${base}?desde=${filters.from}&hasta=${filters.to}`}
                className="text-sm font-semibold text-link underline"
              >
                Quitar filtros
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
