import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatQuantity } from "@/lib/units";
import type { ProductRecipe } from "@/server/services/recipes";

import { RecipeLineForm } from "./recipe-line-form";
import { RecipeRowButton } from "./recipe-row-button";

// Líneas de la receta en el orden en que se agregaron.
export function RecipeList({
  recipe,
  companySlug,
}: {
  recipe: ProductRecipe;
  companySlug: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {recipe.items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 py-3 first:pt-0 md:flex-row md:items-start md:justify-between"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {recipe.canViewSupplies ? (
                <Link
                  href={`/${companySlug}/inventario/insumos/${item.supply.id}`}
                  className="truncate font-bold hover:underline"
                >
                  {item.supply.name}
                </Link>
              ) : (
                <span className="truncate font-bold">{item.supply.name}</span>
              )}
              {item.supply.isArchived && <Badge variant="secondary">Insumo archivado</Badge>}
            </div>
            <p className="text-sm font-semibold tabular-nums">
              {formatQuantity(item.quantity, item.unit)}
            </p>
            <RecipeLineForm
              key={`${item.quantity}-${item.unit}`}
              companySlug={companySlug}
              id={item.id}
              supplyName={item.supply.name}
              supplyUnit={item.supply.unit}
              quantity={item.quantity}
              unit={item.unit}
            />
          </div>
          <div className="flex shrink-0 justify-end">
            <RecipeRowButton companySlug={companySlug} id={item.id} supplyName={item.supply.name} />
          </div>
        </li>
      ))}
    </ul>
  );
}
