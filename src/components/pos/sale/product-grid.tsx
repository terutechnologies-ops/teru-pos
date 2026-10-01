"use client";

import { useState } from "react";
import Image from "next/image";
import { Package, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { PosBlockReason, PosCatalog, PosProduct } from "@/server/services/sales";

const BLOCK_LABELS: Record<PosBlockReason, string> = {
  UNAVAILABLE: "Agotado",
  NO_RECIPE: "Sin receta",
};

// Productos por categoría, con buscador. Con texto en el buscador se busca
// en todas las categorías.
export function ProductGrid({
  catalog,
  onAdd,
}: {
  catalog: PosCatalog;
  onAdd: (product: PosProduct) => void;
}) {
  const [activeId, setActiveId] = useState(catalog.categories[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const query = search.trim().toLocaleLowerCase("es");
  const products = query
    ? catalog.categories
        .flatMap((category) => category.products)
        .filter((product) => product.name.toLocaleLowerCase("es").includes(query))
    : (catalog.categories.find((category) => category.id === activeId)?.products ?? []);

  if (catalog.categories.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Aún no hay categorías activas con productos. El administrador las crea en Catálogo.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
          className="h-12 rounded-lg bg-muted pl-10 text-base"
        />
      </div>

      {!query && (
        <div role="tablist" aria-label="Categorías" className="flex gap-2 overflow-x-auto pb-1">
          {catalog.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={category.id === activeId}
              onClick={() => setActiveId(category.id)}
              className={cn(
                "h-11 shrink-0 rounded-full px-5 text-sm font-bold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                category.id === activeId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-secondary/70",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {query ? "Ningún producto coincide con la búsqueda." : "Esta categoría no tiene productos."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} currency={catalog.currency} onAdd={onAdd} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({
  product,
  currency,
  onAdd,
}: {
  product: PosProduct;
  currency: string;
  onAdd: (product: PosProduct) => void;
}) {
  const blocked = product.blocked;
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      disabled={blocked !== null}
      aria-label={
        blocked
          ? `${product.name}: ${BLOCK_LABELS[blocked]}`
          : `Agregar ${product.name}, ${formatMoney(Number(product.price), currency)}`
      }
      className="group flex w-full flex-col overflow-hidden rounded-xl bg-card text-left shadow-sm transition-colors enabled:hover:ring-2 enabled:hover:ring-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed"
    >
      <span className="relative flex aspect-[4/3] items-center justify-center bg-muted text-muted-foreground">
        {product.imageUrl ? (
          // unoptimized: la foto ya viene reducida y se sirve con caché.
          <Image
            src={product.imageUrl}
            alt=""
            fill
            unoptimized
            className={cn("object-cover", blocked && "opacity-40 grayscale")}
          />
        ) : (
          <Package className="size-8" aria-hidden />
        )}
        {blocked && (
          <span className="absolute inset-x-2 top-2 rounded-md bg-background/90 px-2 py-1 text-center text-xs font-bold text-destructive">
            {BLOCK_LABELS[blocked]}
          </span>
        )}
      </span>
      <span className={cn("flex flex-col gap-0.5 p-3", blocked && "opacity-60")}>
        <span className="line-clamp-2 text-sm leading-tight font-bold">{product.name}</span>
        <span className="text-sm font-semibold text-primary tabular-nums">
          {formatMoney(Number(product.price), currency)}
        </span>
      </span>
    </button>
  );
}
