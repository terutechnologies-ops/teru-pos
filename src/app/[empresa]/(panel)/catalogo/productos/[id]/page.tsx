import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";

import { updateProductAction } from "@/components/catalog/product-actions";
import { PRODUCT_NOTICES } from "@/components/catalog/product-fields";
import { ProductImageCard } from "@/components/catalog/product-image-card";
import { ProductForm } from "@/components/catalog/product-form";
import { ProductTabs } from "@/components/catalog/product-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/server/http/staff-session";
import { getProductForm } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Catálogo · Editar producto" };

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/catalogo/productos/[id]">) {
  const { empresa, id } = await params;
  const imageFailed = (await searchParams).aviso === "sin-foto";
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
      <ProductTabs companySlug={session.company.slug} productId={product.id} active="datos" />
      {imageFailed && (
        <Alert aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{PRODUCT_NOTICES["sin-foto"]}</AlertDescription>
        </Alert>
      )}
      <ProductImageCard
        companySlug={session.company.slug}
        productId={product.id}
        productName={product.name}
        imageUrl={product.imageUrl}
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
