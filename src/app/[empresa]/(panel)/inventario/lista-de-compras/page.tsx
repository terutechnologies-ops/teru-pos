import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Info, Printer } from "lucide-react";

import { ShoppingListRows, ShoppingListSection } from "@/components/inventory/shopping-list";
import { shoppingListSheetHref } from "@/components/printing/print-sheets";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getShoppingList } from "@/server/services/shopping-list";

export const metadata: Metadata = { title: "Inventario · Lista de compras" };

export default async function ShoppingListPage({
  params,
}: PageProps<"/[empresa]/inventario/lista-de-compras">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "inventory.manage");
  const list = await getShoppingList(session);
  const slug = session.company.slug;
  const total = list.toBuy.length + list.enough.length + list.noSuggestion.length;
  const withIdeal = list.toBuy.length + list.enough.length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Inventario"
          title="Lista de compras"
          description="Cuánto comprar de cada insumo para volver a su stock ideal, sumando todas las bodegas."
        />
        {total > 0 && (
          <Button asChild variant="outline" className="h-11 gap-2">
            <Link href={shoppingListSheetHref(slug)}>
              <Printer aria-hidden />
              Imprimir lista
            </Link>
          </Button>
        )}
      </div>

      {total === 0 ? (
        <EmptyState
          title="Aún no tienes insumos"
          text="Registra tus insumos y su stock ideal para saber cuánto comprar."
          action={
            <Button asChild className="h-11 px-5">
              <Link href={`/${slug}/inventario/insumos/nuevo`}>Nuevo insumo</Link>
            </Button>
          }
        />
      ) : (
        <>
          {withIdeal === 0 && (
            <Alert>
              <Info />
              <AlertDescription>
                Ningún insumo tiene stock ideal. Defínelo en cada insumo (lo que quieres tener al
                empezar el día) y aquí verás cuánto comprar.
              </AlertDescription>
            </Alert>
          )}

          {withIdeal > 0 && (
            <ShoppingListSection
              title="Por comprar"
              description="Por debajo de su stock ideal."
              count={list.toBuy.length}
            >
              {list.toBuy.length > 0 ? (
                <ShoppingListRows items={list.toBuy} companySlug={slug} />
              ) : (
                <EmptyState
                  icon={CircleCheck}
                  title="Nada por comprar"
                  text="Todos los insumos con stock ideal tienen lo suficiente."
                />
              )}
            </ShoppingListSection>
          )}

          {list.enough.length > 0 && (
            <ShoppingListSection
              title="Alcanzan"
              description="Su existencia cubre el stock ideal."
              count={list.enough.length}
            >
              <ShoppingListRows items={list.enough} companySlug={slug} />
            </ShoppingListSection>
          )}

          {list.noSuggestion.length > 0 && (
            <ShoppingListSection
              title="Sin sugerencia"
              description="Sin stock ideal o sin carga inicial: solo se muestra lo que queda."
              count={list.noSuggestion.length}
            >
              <ShoppingListRows items={list.noSuggestion} companySlug={slug} />
            </ShoppingListSection>
          )}
        </>
      )}
    </div>
  );
}
