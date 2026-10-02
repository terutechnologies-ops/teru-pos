import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Plus, Search, TriangleAlert } from "lucide-react";

import { PRODUCT_ALERT_INFO, PRODUCT_NOTICES } from "@/components/catalog/product-fields";
import { ProductList } from "@/components/catalog/product-list";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChip } from "@/components/shared/filter-chip";
import { PageHeader } from "@/components/shared/page-header";
import { StatusTabs } from "@/components/shared/status-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withQuery } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { getProductCatalog, isProductAlert } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Catálogo · Productos" };

const fieldClass =
  "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function ProductsPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/catalogo/productos">) {
  const { empresa } = await params;
  const query = await searchParams;
  const search = param(query.q);
  const categoryId = param(query.categoria);
  const archived = param(query.archivados) === "1";
  // Las alertas (enlaces del inicio) son de productos no archivados.
  const alertParam = param(query.alerta);
  const alert = !archived && isProductAlert(alertParam) ? alertParam : null;
  const notice = PRODUCT_NOTICES[param(query.aviso) as keyof typeof PRODUCT_NOTICES];

  const session = await requirePermission(empresa, "catalog.manage");
  const { currency, categories, products } = await getProductCatalog(session, {
    search,
    categoryId,
    archived,
    alert: alert ?? undefined,
  });
  const slug = session.company.slug;
  const base = `/${slug}/catalogo/productos`;
  const filtered = Boolean(search || categoryId);
  // Solo se crean productos en categorías activas.
  const canCreate = categories.some((category) => category.isActive);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Catálogo"
          title="Productos"
          description="Lo que vendes, agrupado por categoría en el orden en que se verá al vender."
        />
        {canCreate && (
          <Button asChild className="h-11 gap-2 px-5">
            <Link href={`${base}/nuevo`}>
              <Plus aria-hidden />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      {categories.length > 0 && !canCreate && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            Todas tus categorías están inactivas: activa al menos una en{" "}
            <Link href={`/${slug}/catalogo/categorias`} className="font-semibold text-link underline">
              Categorías
            </Link>{" "}
            para crear productos.
          </AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {categories.length === 0 ? (
        <EmptyState
          title="Primero crea tus categorías"
          text="Cada producto pertenece a una categoría (por ejemplo Arepas o Bebidas)."
          action={
            <Button asChild variant="outline">
              <Link href={`/${slug}/catalogo/categorias`}>Ir a categorías</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* GET: los filtros quedan en la dirección y funcionan sin JS. */}
          <form
            action={base}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm sm:flex-row sm:items-end"
          >
            {archived && <input type="hidden" name="archivados" value="1" />}
            {alert && <input type="hidden" name="alerta" value={alert} />}
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
                className={`${fieldClass} pl-9`}
              />
            </div>
            <select
              name="categoria"
              defaultValue={categoryId}
              aria-label="Filtrar por categoría"
              className={`${fieldClass} min-w-0 border px-3 outline-none sm:w-56`}
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" className="h-10 px-4">
                Filtrar
              </Button>
              {filtered && (
                <Button asChild variant="ghost" className="h-10 px-3">
                  <Link
                    href={withQuery(base, { archivados: archived ? "1" : "", alerta: alert ?? "" })}
                  >
                    Limpiar
                  </Link>
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

          {alert && (
            <FilterChip
              label={PRODUCT_ALERT_INFO[alert].title}
              clearHref={withQuery(base, { q: search, categoria: categoryId })}
            />
          )}

          {products.length > 0 ? (
            <ProductList products={products} currency={currency} companySlug={slug} />
          ) : filtered ? (
            <EmptyState
              title="Sin resultados"
              text="Ningún producto coincide con la búsqueda o el filtro."
            />
          ) : alert ? (
            <EmptyState
              icon={CircleCheck}
              title="Sin pendientes"
              text={PRODUCT_ALERT_INFO[alert].empty}
            />
          ) : archived ? (
            <EmptyState title="No hay productos archivados" text="Los productos que archives aparecerán aquí." />
          ) : (
            <EmptyState
              title="Aún no tienes productos"
              text="Agrega lo que vendes con su precio. Luego podrás marcarlo como agotado o archivarlo."
              action={
                canCreate && (
                  <Button asChild>
                    <Link href={`${base}/nuevo`}>
                      <Plus aria-hidden />
                      Nuevo producto
                    </Link>
                  </Button>
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}
