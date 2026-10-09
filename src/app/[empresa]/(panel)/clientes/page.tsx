import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Plus, Search } from "lucide-react";

import { CUSTOMER_NOTICES } from "@/components/customers/customer-fields";
import { CustomerList } from "@/components/customers/customer-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusTabs } from "@/components/shared/status-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withQuery } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { getCustomerList } from "@/server/services/customers";

export const metadata: Metadata = { title: "Ventas · Clientes" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function CustomersPage({ params, searchParams }: PageProps<"/[empresa]/clientes">) {
  const { empresa } = await params;
  const query = await searchParams;
  const search = param(query.q);
  const archived = param(query.archivados) === "1";
  const notice = CUSTOMER_NOTICES[param(query.aviso) as keyof typeof CUSTOMER_NOTICES];

  const session = await requirePermission(empresa, "customers.manage");
  const { currency, customers } = await getCustomerList(session, { search, archived });
  const base = `/${session.company.slug}/clientes`;
  const newButton = (
    <Button asChild className="h-11 gap-2 px-5">
      <Link href={`${base}/nuevo`}>
        <Plus aria-hidden />
        Nuevo cliente
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Ventas"
          title="Clientes"
          description="A quién le vendes a crédito: cupo, plazo y cuánto debe. Los archivados no compran a crédito."
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
      <form action={base} className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm sm:flex-row sm:items-end">
        {archived && <input type="hidden" name="archivados" value="1" />}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden />
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

      {customers.length > 0 ? (
        <CustomerList customers={customers} companySlug={session.company.slug} currency={currency} />
      ) : search ? (
        <EmptyState title="Sin resultados" text="Ningún cliente coincide con la búsqueda." />
      ) : archived ? (
        <EmptyState title="No hay clientes archivados" text="Los clientes que archives aparecerán aquí." />
      ) : (
        <EmptyState
          title="Aún no tienes clientes de crédito"
          text="Registra a quién le vendes a crédito con su cupo, su plazo y su correo para enviarle el registro de cada compra."
          action={newButton}
        />
      )}
    </div>
  );
}
