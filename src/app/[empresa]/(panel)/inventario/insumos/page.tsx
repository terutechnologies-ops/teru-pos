import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Plus, Search } from "lucide-react";

import { SUPPLY_NOTICES } from "@/components/inventory/supply-fields";
import { SupplyList } from "@/components/inventory/supply-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusTabs } from "@/components/shared/status-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/server/http/staff-session";
import { getSupplyList } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Inventario · Insumos" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function SuppliesPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/inventario/insumos">) {
  const { empresa } = await params;
  const query = await searchParams;
  const search = param(query.q);
  const archived = param(query.archivados) === "1";
  const notice = SUPPLY_NOTICES[param(query.aviso) as keyof typeof SUPPLY_NOTICES];

  const session = await requirePermission(empresa, "inventory.manage");
  const supplies = await getSupplyList(session, { search, archived });
  const base = `/${session.company.slug}/inventario/insumos`;
  const newButton = (
    <Button asChild className="h-11 gap-2 px-5">
      <Link href={`${base}/nuevo`}>
        <Plus aria-hidden />
        Nuevo insumo
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Inventario"
          title="Insumos"
          description="Lo que compras y guardas para preparar o revender, con su existencia en todas las bodegas."
        />
        {newButton}
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {/* GET: la búsqueda queda en la dirección y funciona sin JS. */}
      <form
        action={base}
        className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm sm:flex-row sm:items-end"
      >
        {archived && <input type="hidden" name="archivados" value="1" />}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Buscar por nombre"
            aria-label="Buscar por nombre"
            className="h-10 rounded-lg border-transparent bg-muted pl-9 text-sm focus-visible:bg-card"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="h-10 px-4">
            Buscar
          </Button>
          {search && (
            <Button asChild variant="ghost" className="h-10 px-3">
              <Link href={archived ? `${base}?archivados=1` : base}>Limpiar</Link>
            </Button>
          )}
        </div>
      </form>

      <StatusTabs
        label="Estado"
        tabs={[
          { href: base, label: "Activos", active: !archived },
          { href: `${base}?archivados=1`, label: "Archivados", active: archived },
        ]}
      />

      {supplies.length > 0 ? (
        <SupplyList supplies={supplies} companySlug={session.company.slug} />
      ) : search ? (
        <EmptyState title="Sin resultados" text="Ningún insumo coincide con la búsqueda." />
      ) : archived ? (
        <EmptyState
          title="No hay insumos archivados"
          text="Los insumos que archives aparecerán aquí."
        />
      ) : (
        <EmptyState
          title="Aún no tienes insumos"
          text="Registra lo que guardas en tus bodegas (harina, queso, gaseosas) con su unidad de medida. Luego podrás cargar sus existencias."
          action={newButton}
        />
      )}
    </div>
  );
}
