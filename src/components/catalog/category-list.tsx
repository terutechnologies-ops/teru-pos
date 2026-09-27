import { FolderOpen, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CategoryOverview } from "@/server/services/catalog";

import { CategoryRowButton } from "./category-row-button";
import { RenameCategoryForm } from "./rename-category-form";

// Categorías en el orden en que se verán en el POS.
export function CategoryList({
  categories,
  companySlug,
}: {
  categories: CategoryOverview[];
  companySlug: string;
}) {
  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input px-6 py-10 text-center">
        <FolderOpen className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">Aún no tienes categorías</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Crea las secciones de tu menú (por ejemplo Arepas, Bebidas y Postres)
          para organizar tus productos.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col divide-y divide-border">
      {categories.map((category, index) => (
        <li
          key={category.id}
          className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="flex shrink-0 flex-col">
              <CategoryRowButton
                companySlug={companySlug}
                intent="up"
                id={category.id}
                categoryName={category.name}
                disabled={index === 0}
              />
              <CategoryRowButton
                companySlug={companySlug}
                intent="down"
                id={category.id}
                categoryName={category.name}
                disabled={index === categories.length - 1}
              />
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5 pt-1", !category.isActive && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-bold">{category.name}</span>
                {!category.isActive && <Badge variant="destructive">Inactiva</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {category.productCount === 1
                  ? "1 producto"
                  : `${category.productCount} productos`}
              </p>
              {/* key: tras renombrar, el bloque se vuelve a cerrar. */}
              <details key={category.name} className="group">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-semibold text-link [&::-webkit-details-marker]:hidden">
                  <Pencil className="size-3" aria-hidden />
                  Renombrar
                </summary>
                <div className="mt-2 max-w-md">
                  <RenameCategoryForm
                    companySlug={companySlug}
                    id={category.id}
                    currentName={category.name}
                  />
                </div>
              </details>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
            <CategoryRowButton
              companySlug={companySlug}
              intent={category.isActive ? "deactivate" : "activate"}
              id={category.id}
              categoryName={category.name}
            />
            {category.canDelete && (
              <CategoryRowButton
                companySlug={companySlug}
                intent="delete"
                id={category.id}
                categoryName={category.name}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
