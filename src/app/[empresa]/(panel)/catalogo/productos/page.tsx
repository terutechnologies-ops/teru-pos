import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, PackageOpen, Plus, Search } from "lucide-react";

import { PRODUCT_NOTICES } from "@/components/catalog/product-fields";
import { ProductList } from "@/components/catalog/product-list";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/server/http/staff-session";
import { getProductCatalog } from "@/server/services/catalog";

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
  const notice = PRODUCT_NOTICES[param(query.aviso) as keyof typeof PRODUCT_NOTICES];

  const session = await requirePermission(empresa, "catalog.manage");
  const { currency, categories, products } = await getProductCatalog(session, {
    search,
    categoryId,
    archived,
  });
  const slug = session.company.slug;
  const base = `/${slug}/catalogo/productos`;
  const filtered = Boolean(search || categoryId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Catálogo"
          title="Productos"
          description="Lo que vendes, agrupado por categoría en el orden en que se verá al vender."
        />
        {categories.length > 0 && (
          <Button asChild className="h-11 gap-2 px-5">
            <Link href={`${base}/nuevo`}>
              <Plus aria-hidden />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {categories.length === 0 ? (
        <Empty
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
                  <Link href={archived ? `${base}?archivados=1` : base}>Limpiar</Link>
                </Button>
              )}
            </div>
          </form>

          <nav aria-label="Estado" className="flex gap-2 text-sm font-semibold">
            <Tab href={base} active={!archived}>
              Activos
            </Tab>
            <Tab href={`${base}?archivados=1`} active={archived}>
              Archivados
            </Tab>
          </nav>

          {products.length > 0 ? (
            <ProductList products={products} currency={currency} companySlug={slug} />
          ) : filtered ? (
            <Empty
              title="Sin resultados"
              text="Ningún producto coincide con la búsqueda o el filtro."
            />
          ) : archived ? (
            <Empty title="No hay productos archivados" text="Los productos que archives aparecerán aquí." />
          ) : (
            <Empty
              title="Aún no tienes productos"
              text="Agrega lo que vendes con su precio. Luego podrás marcarlo como agotado o archivarlo."
              action={
                <Button asChild>
                  <Link href={`${base}/nuevo`}>
                    <Plus aria-hidden />
                    Nuevo producto
                  </Link>
                </Button>
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-full bg-primary px-4 py-1.5 text-primary-foreground"
          : "rounded-full bg-muted px-4 py-1.5 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </Link>
  );
}

function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card px-6 py-12 text-center">
      <PackageOpen className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
