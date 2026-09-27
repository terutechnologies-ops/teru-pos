import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createProductAction } from "@/components/catalog/product-actions";
import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/server/http/staff-session";
import { getProductForm } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Catálogo · Nuevo producto" };

export default async function NewProductPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/catalogo/productos/nuevo">) {
  const { empresa } = await params;
  const { categoria } = await searchParams;
  const session = await requirePermission(empresa, "catalog.manage");
  const form = await getProductForm(session);
  // Sin categorías activas no hay dónde crear: la lista explica qué hacer.
  if (!form || form.categories.length === 0) {
    redirect(`/${session.company.slug}/catalogo/productos`);
  }

  const preselected =
    typeof categoria === "string" && form.categories.some((c) => c.id === categoria)
      ? categoria
      : "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader eyebrow="Catálogo" title="Nuevo producto" />
      <ProductForm
        action={createProductAction}
        companySlug={session.company.slug}
        currency={form.currency}
        categories={form.categories}
        initialValues={{ name: "", categoryId: preselected, description: "", price: "" }}
        submitLabel="Crear producto"
      />
    </div>
  );
}
