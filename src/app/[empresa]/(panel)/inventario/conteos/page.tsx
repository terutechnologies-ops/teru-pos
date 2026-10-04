import type { Metadata } from "next";
import { CircleCheck, ClipboardCheck, Warehouse } from "lucide-react";

import { COUNT_LIST_NOTICES } from "@/components/inventory/count-fields";
import { CountDraftList } from "@/components/inventory/count-draft-list";
import { StartCountForm } from "@/components/inventory/start-count-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/server/http/staff-session";
import { getCountDrafts, getCountStartOptions } from "@/server/services/inventory-counts";

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
  const [options, drafts] = await Promise.all([
    getCountStartOptions(session),
    getCountDrafts(session),
  ]);

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
    </div>
  );
}
