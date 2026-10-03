import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Plus, Search } from "lucide-react";

import { SUPPLIER_NOTICES } from "@/components/purchases/supplier-fields";
import { SupplierList } from "@/components/purchases/supplier-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusTabs } from "@/components/shared/status-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withQuery } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { getSupplierList } from "@/server/services/third-parties";

export const metadata: Metadata = { title: "Compras · Proveedores" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function SuppliersPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/compras/proveedores">) {
  const { empresa } = await params;
  const query = await searchParams;
  const search = param(query.q);
  const archived = param(query.archivados) === "1";
  const notice = SUPPLIER_NOTICES[param(query.aviso) as keyof typeof SUPPLIER_NOTICES];

  const session = await requirePermission(empresa, "purchases.manage");
  const suppliers = await getSupplierList(session, { search, archived });
  const base = `/${session.company.slug}/compras/proveedores`;
  const newButton = (
    <Button asChild className="h-11 gap-2 px-5">
      <Link href={`${base}/nuevo`}>
        <Plus aria-hidden />
        Nuevo proveedor
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Compras"
          title="Proveedores"
          description="A quién le compras tus insumos. Los archivados no se eligen en compras nuevas."
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
            placeholder="Buscar por nombre o NIT"
            aria-label="Buscar por nombre o NIT"
            className="h-10 rounded-lg border-transparent bg-muted pl-9 text-sm focus-visible:bg-card"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="h-10 px-4">
            Buscar
          </Button>
          {search && (
            <Button asChild variant="ghost" className="h-10 px-3">
              <Link href={withQuery(base, { archivados: archived ? "1" : "" })}>Limpiar</Link>
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

      {suppliers.length > 0 ? (
        <SupplierList suppliers={suppliers} companySlug={session.company.slug} />
      ) : search ? (
        <EmptyState title="Sin resultados" text="Ningún proveedor coincide con la búsqueda." />
      ) : archived ? (
        <EmptyState
          title="No hay proveedores archivados"
          text="Los proveedores que archives aparecerán aquí."
        />
      ) : (
        <EmptyState
          title="Aún no tienes proveedores"
          text="Registra a quién le compras (nombre, NIT y contacto) para asociarlo a tus compras."
          action={newButton}
        />
      )}
    </div>
  );
}
