import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateProductAction } from "@/components/catalog/product-actions";
import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/server/http/staff-session";
import { getProductForm } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Catálogo · Editar producto" };

export default async function EditProductPage({
  params,
}: PageProps<"/[empresa]/catalogo/productos/[id]">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "catalog.manage");
  const form = await getProductForm(session, id);
  if (!form?.product) notFound();
  const { product } = form;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Catálogo · Editar producto"
        title={product.name}
        description={
          (product.isArchived || !product.isAvailable) && (
            <span className="flex gap-1.5">
              {product.isArchived && <Badge variant="secondary">Archivado</Badge>}
              {!product.isAvailable && <Badge variant="destructive">Agotado</Badge>}
            </span>
          )
        }
      />
      <ProductForm
        action={updateProductAction}
        companySlug={session.company.slug}
        productId={product.id}
        currency={form.currency}
        categories={form.categories}
        initialValues={{
          name: product.name,
          categoryId: product.category.id,
          description: product.description ?? "",
          price: product.price,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
