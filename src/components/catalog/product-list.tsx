import Link from "next/link";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/server/services/catalog";

import { PRODUCT_ALERT_INFO } from "./product-fields";
import { CostingLine } from "./product-costing";
import { ProductRowButton } from "./product-row-button";
import { ProductThumb } from "./product-thumb";

// Productos agrupados por categoría, en el orden del POS (ya vienen
// ordenados del servicio).
export function ProductList({
  products,
  currency,
  companySlug,
}: {
  products: CatalogProduct[];
  currency: string;
  companySlug: string;
}) {
  const groups: { category: CatalogProduct["category"]; items: CatalogProduct[] }[] = [];
  for (const product of products) {
    const last = groups.at(-1);
    if (last?.category.id === product.category.id) last.items.push(product);
    else groups.push({ category: product.category, items: [product] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ category, items }) => (
        <section
          key={category.id}
          aria-labelledby={`cat-${category.id}`}
          className="rounded-xl bg-card p-5 shadow-sm sm:p-6"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id={`cat-${category.id}`} className="text-lg font-bold">
              {category.name}
            </h2>
            <span className="text-sm text-muted-foreground">({items.length})</span>
            {!category.isActive && <Badge variant="destructive">Categoría inactiva</Badge>}
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {items.map((product) => {
              // Sin receta no se vende: la insignia reemplaza la línea de costo.
              const noRecipe = !product.isArchived && product.costing.status === "NO_RECIPE";
              return (
                <li
                  key={product.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3",
                      (product.isArchived || !product.isAvailable) && "opacity-70",
                    )}
                  >
                    <ProductThumb imageUrl={product.imageUrl} productName={product.name} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold">{product.name}</span>
                        {product.isArchived && <Badge variant="secondary">Archivado</Badge>}
                        {!product.isAvailable && <Badge variant="destructive">Agotado</Badge>}
                        {noRecipe && (
                          <Badge variant="destructive">{PRODUCT_ALERT_INFO["sin-receta"].badge}</Badge>
                        )}
                      </div>
                      {product.description && (
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {product.description}
                        </p>
                      )}
                      <p className="text-sm font-extrabold text-link">
                        {formatMoney(Number(product.price), currency)}
                      </p>
                      {!noRecipe && <CostingLine costing={product.costing} currency={currency} />}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/${companySlug}/catalogo/productos/${product.id}`}
                        aria-label={`Editar ${product.name}`}
                      >
                        <Pencil aria-hidden />
                        Editar
                      </Link>
                    </Button>
                    {!product.isArchived && (
                      <ProductRowButton
                        companySlug={companySlug}
                        intent={product.isAvailable ? "soldout" : "available"}
                        id={product.id}
                        productName={product.name}
                      />
                    )}
                    <ProductRowButton
                      companySlug={companySlug}
                      intent={product.isArchived ? "restore" : "archive"}
                      id={product.id}
                      productName={product.name}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
