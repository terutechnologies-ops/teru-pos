import type { Metadata } from "next";
import { CircleCheck, Vault } from "lucide-react";

import { CashFilters } from "@/components/cash/cash-filters";
import { ShiftReviewList } from "@/components/cash/shift-review-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDate, formatMoney } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { CASH_REVIEW_LIMIT, getCashOverview } from "@/server/services/cash-sessions";

export const metadata: Metadata = { title: "Cierres de caja" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function shiftsCount(count: number) {
  return count === 1 ? "1 turno" : `${count} turnos`;
}

export default async function CashReviewPage({ params, searchParams }: PageProps<"/[empresa]/caja">) {
  const { empresa } = await params;
  const query = await searchParams;
  const session = await requirePermission(empresa, "cash.review");
  const base = `/${session.company.slug}/caja`;

  const overview = await getCashOverview(session, {
    desde: param(query.desde),
    hasta: param(query.hasta),
    cajero: param(query.cajero),
    sucursal: param(query.sucursal),
  });
  const { filters, summary, currency, dateFormat, timeZone } = overview;
  const money = (value: string) => formatMoney(Number(value), currency);
  const day = (value: string) => formatDate(new Date(`${value}T00:00:00Z`), dateFormat);
  const rangeLabel =
    filters.from === filters.to
      ? filters.from === overview.today
        ? `Cerrados · abiertos hoy, ${day(filters.from)}`
        : `Cerrados · abiertos el ${day(filters.from)}`
      : `Cerrados · abiertos del ${day(filters.from)} al ${day(filters.to)}`;
  const listProps = {
    basePath: base,
    currency,
    dateFormat,
    timeZone,
    showBranch: overview.branches.length > 0,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Ventas"
        title="Cierres de caja"
        description="Turnos de caja con su cuadre: el efectivo que debería haber y el que se contó. Un turno olvidado se cierra desde su detalle."
      />

      <section aria-labelledby="turnos-abiertos" className="flex flex-col gap-3">
        <h2 id="turnos-abiertos" className="text-lg font-bold">
          Turnos abiertos
        </h2>
        {overview.open.length > 0 ? (
          <ShiftReviewList shifts={overview.open} {...listProps} />
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-card px-5 py-4 text-sm shadow-sm">
            <CircleCheck className="size-5 text-success" aria-hidden />
            No hay turnos abiertos.
          </p>
        )}
      </section>

      <CashFilters overview={overview} basePath={base} />

      <section aria-labelledby="turnos-cerrados" className="flex flex-col gap-3">
        <h2 id="turnos-cerrados" className="text-lg font-bold">
          {rangeLabel}
        </h2>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-card p-5 shadow-sm">
            <dt className="text-xs font-semibold text-muted-foreground">Faltantes</dt>
            <dd
              className={
                summary.shortageCount > 0
                  ? "mt-1 text-2xl font-extrabold text-destructive tabular-nums"
                  : "mt-1 text-2xl font-extrabold tabular-nums"
              }
            >
              {money(summary.shortageTotal)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {shiftsCount(summary.shortageCount)} con menos efectivo del esperado
            </dd>
          </div>
          <div className="rounded-xl bg-card p-5 shadow-sm">
            <dt className="text-xs font-semibold text-muted-foreground">Sobrantes</dt>
            <dd className="mt-1 text-2xl font-extrabold tabular-nums">
              {money(summary.surplusTotal)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {shiftsCount(summary.surplusCount)} con más efectivo del esperado
            </dd>
          </div>
        </dl>

        {overview.closed.length > 0 ? (
          <>
            <ShiftReviewList shifts={overview.closed} {...listProps} />
            {overview.closedCount > CASH_REVIEW_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Se muestran los {CASH_REVIEW_LIMIT} más recientes de {overview.closedCount}.
                Acorta el rango de fechas para ver los demás.
              </p>
            )}
          </>
        ) : (
          <EmptyState
            icon={Vault}
            title="Sin cierres"
            text="No hay turnos cerrados que se hayan abierto en estas fechas."
          />
        )}
      </section>
    </div>
  );
}
