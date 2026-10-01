import { NewNameForm } from "@/components/shared/new-name-form";

import { createCategoryAction } from "./category-actions";

export function NewCategoryForm({ companySlug }: { companySlug: string }) {
  return (
    <NewNameForm
      action={createCategoryAction}
      companySlug={companySlug}
      inputId="new-category"
      placeholder="Ej: Arepas, Bebidas, Postres"
      maxLength={60}
    />
  );
}
