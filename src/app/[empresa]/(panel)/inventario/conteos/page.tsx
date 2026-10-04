import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, ClipboardCheck, ClipboardList, SearchX, Warehouse } from "lucide-react";

import { COUNT_LIST_NOTICES } from "@/components/inventory/count-fields";
import { CountDraftList } from "@/components/inventory/count-draft-list";
import { CountList } from "@/components/inventory/count-list";
import { CountsFilters } from "@/components/inventory/counts-filters";
import { StartCountForm } from "@/components/inventory/start-count-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import {
  COUNTS_LIST_LIMIT,
  findCountByNumber,
  getCountDrafts,
  getCountsOverview,
  getCountStartOptions,
} from "@/server/services/inventory-counts";

export const metadata: Metadata = { title: "Conteos" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function CountsPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/inventario/conteos">) {
  const { empresa } = await params;
  const query = await searchParams;
  const notice = COUNT_LIST_NOTICES[param(query.aviso) as keyof typeof COUNT_LIST_NOTICES];

  const session = await requirePermission(empresa, "inventory.manage");
  const slug = session.company.slug;
  const base = `/${slug}/inventario/conteos`;

  // "Ir al conteo #N": si existe, directo a su detalle.
  const number = param(query.numero).trim();
  if (number) {
    const countId = await findCountByNumber(session, number);
    if (countId) redirect(`${base}/${countId}`);
  }

  const [options, drafts, overview] = await Promise.all([
    getCountStartOptions(session),
    getCountDrafts(session),
    getCountsOverview(session, {
      desde: param(query.desde),
      hasta: param(query.hasta),
      bodega: param(query.bodega),
    }),
  ]);
  const { filters, dateFormat } = overview;
  const day = (value: string) => formatDate(new Date(`${value}T00:00:00Z`), dateFormat);
  const rangeLabel =
    filters.from === overview.defaultFrom && filters.to === overview.today
      ? "Confirmados en los últimos 90 días"
      : filters.from === filters.to
        ? `Confirmados el ${day(filters.from)}`
        : `Confirmados del ${day(filters.from)} al ${day(filters.to)}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="Inventario"
        title="Conteos"
        description="Cuenta lo que hay en una bodega y corrige el inventario con lo contado. Las diferencias quedan en el kardex de cada insumo."
      />

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {number && (
        <Alert>
          <SearchX />
          <AlertDescription>No existe el conteo #{number.replace(/^#/, "")}.</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ClipboardCheck className="size-5" aria-hidden />}
          title="Nuevo conteo"
          description="Si la bodega ya tiene un conteo en curso, se retoma ese."
        />
        {options.warehouses.length > 0 ? (
          <StartCountForm
            companySlug={slug}
            warehouses={options.warehouses}
            showBranch={options.showBranch}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No tienes bodegas activas. Activa una en Bodegas para contarla.
          </p>
        )}
      </section>

      <section aria-labelledby="counts-drafts" className="flex flex-col gap-3">
        <h2 id="counts-drafts" className="text-lg font-bold">
          En curso
        </h2>
        {drafts.length > 0 ? (
          <CountDraftList drafts={drafts} companySlug={slug} />
        ) : (
          <EmptyState
            icon={Warehouse}
            title="Sin conteos en curso"
            text="Empieza uno para registrar lo que contaste. Puedes guardar el avance y seguir después."
          />
        )}
      </section>

      <section aria-labelledby="counts-confirmed" className="flex flex-col gap-3">
        <h2 id="counts-confirmed" className="text-lg font-bold">
          {rangeLabel}
        </h2>
        <CountsFilters overview={overview} basePath={base} />
        {overview.counts.length > 0 ? (
          <div className="flex flex-col gap-2">
            <CountList overview={overview} basePath={base} />
            {overview.totalCount > COUNTS_LIST_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Se muestran los {COUNTS_LIST_LIMIT} más recientes de {overview.totalCount}.
                Acorta el rango de fechas para ver los demás.
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={filters.warehouseId ? "Sin resultados" : "Sin conteos confirmados"}
            text={
              filters.warehouseId
                ? "Ningún conteo de esa bodega se confirmó en estas fechas."
                : "Aquí verás cada conteo confirmado con lo que faltó o sobró, valorizado."
            }
            action={
              filters.warehouseId ? (
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
      </section>
    </div>
  );
}
