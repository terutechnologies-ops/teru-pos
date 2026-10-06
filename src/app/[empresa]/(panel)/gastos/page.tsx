import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";

import { CashMovementFilters } from "@/components/cash/cash-movement-filters";
import { CashMovementLedger } from "@/components/cash/cash-movement-ledger";
import { CashMovementSummary } from "@/components/cash/cash-movement-summary";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDate } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import {
  CASH_MOVEMENTS_LIMIT,
  getCashMovementsOverview,
} from "@/server/services/cash-movements";

export const metadata: Metadata = { title: "Gastos" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function CashMovementsPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/gastos">) {
  const { empresa } = await params;
  const query = await searchParams;
  const session = await requirePermission(empresa, "cash.review");
  const slug = session.company.slug;
  const base = `/${slug}/gastos`;

  const overview = await getCashMovementsOverview(session, {
    desde: param(query.desde),
    hasta: param(query.hasta),
    ver: param(query.ver),
    cajero: param(query.cajero),
    sucursal: param(query.sucursal),
  });
  const { filters, dateFormat } = overview;
  const day = (value: string) => formatDate(new Date(`${value}T00:00:00Z`), dateFormat);
  const rangeLabel =
    filters.from === filters.to
      ? filters.from === overview.today
        ? `Hoy, ${day(filters.from)}`
        : day(filters.from)
      : `Del ${day(filters.from)} al ${day(filters.to)}`;
  const filtered = Boolean(filters.view || filters.cashierId || filters.branchId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Ventas"
        title="Gastos"
        description="Gastos, retiros e ingresos de efectivo registrados en los turnos de caja. Se anulan desde el detalle de su turno mientras siga abierto."
      />

      <CashMovementFilters overview={overview} basePath={base} />

      <section aria-labelledby="gastos-rango" className="flex flex-col gap-3">
        <h2 id="gastos-rango" className="text-lg font-bold">
          {rangeLabel}
        </h2>
        <CashMovementSummary summary={overview.summary} currency={overview.currency} />
      </section>

      {overview.movements.length > 0 ? (
        <div className="flex flex-col gap-2">
          <CashMovementLedger overview={overview} companySlug={slug} />
          {overview.totalCount > CASH_MOVEMENTS_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Se muestran los {CASH_MOVEMENTS_LIMIT} más recientes de {overview.totalCount}.
              Acorta el rango de fechas para ver los demás.
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Banknote}
          title={filtered ? "Sin resultados" : "Sin movimientos"}
          text={
            filtered
              ? "Ningún movimiento del rango coincide con los filtros."
              : "No hay gastos, retiros ni ingresos registrados en estas fechas."
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
