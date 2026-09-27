import type { Metadata } from "next";
import { FolderPlus, ListOrdered } from "lucide-react";

import { CategoryList } from "@/components/catalog/category-list";
import { NewCategoryForm } from "@/components/catalog/new-category-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { requirePermission } from "@/server/http/staff-session";
import { getCategories } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Catálogo · Categorías" };

export default async function CategoriesPage({
  params,
}: PageProps<"/[empresa]/catalogo/categorias">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "catalog.manage");
  const categories = await getCategories(session);
  const slug = session.company.slug;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Categorías"
        description="Las secciones de tu menú. El orden de esta lista es el orden en que se verán al vender."
      />

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<FolderPlus className="size-5" aria-hidden />}
          title="Nueva categoría"
          description="Se agrega al final de la lista."
        />
        <NewCategoryForm companySlug={slug} />
      </section>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ListOrdered className="size-5" aria-hidden />}
          title={`Categorías (${categories.length})`}
          description="Usa las flechas para ordenarlas. Una categoría inactiva no se mostrará al vender; solo se puede eliminar si nunca tuvo productos."
        />
        <CategoryList categories={categories} companySlug={slug} />
      </section>
    </div>
  );
}
