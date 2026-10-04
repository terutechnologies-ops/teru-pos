import { RenameForm } from "@/components/shared/rename-form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExpenseCategoryOverview } from "@/server/services/expense-categories";

import { renameExpenseCategoryAction } from "./expense-category-actions";
import { ExpenseCategoryRowButton } from "./expense-category-row-button";

// Categorías de gasto en el orden en que el cajero las verá. Eliminar solo
// aparece en las que nunca se usaron.
export function ExpenseCategoryList({
  categories,
  companySlug,
}: {
  categories: ExpenseCategoryOverview[];
  companySlug: string;
}) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {categories.map((category, index) => (
        <li
          key={category.id}
          className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="flex shrink-0 flex-col">
              <ExpenseCategoryRowButton
                companySlug={companySlug}
                intent="up"
                id={category.id}
                categoryName={category.name}
                disabled={index === 0}
              />
              <ExpenseCategoryRowButton
                companySlug={companySlug}
                intent="down"
                id={category.id}
                categoryName={category.name}
                disabled={index === categories.length - 1}
              />
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1.5 pt-1",
                !category.isActive && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-bold">{category.name}</span>
                {!category.isActive && <Badge variant="destructive">Inactiva</Badge>}
                <span className="text-xs text-muted-foreground">
                  {category.expenseCount === 0
                    ? "Sin gastos"
                    : category.expenseCount === 1
                      ? "1 gasto"
                      : `${category.expenseCount} gastos`}
                </span>
              </div>
              <RenameForm
                key={category.name}
                action={renameExpenseCategoryAction}
                companySlug={companySlug}
                id={category.id}
                currentName={category.name}
                maxLength={40}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
            <ExpenseCategoryRowButton
              companySlug={companySlug}
              intent={category.isActive ? "deactivate" : "activate"}
              id={category.id}
              categoryName={category.name}
            />
            {category.canDelete && (
              <ExpenseCategoryRowButton
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
