import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, ChefHat, PackageOpen } from "lucide-react";

import { AddRecipeItemForm } from "@/components/catalog/add-recipe-item-form";
import { CostingSummary } from "@/components/catalog/product-costing";
import { ProductTabs } from "@/components/catalog/product-tabs";
import { RecipeList } from "@/components/catalog/recipe-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getProductRecipe } from "@/server/services/recipes";

export const metadata: Metadata = { title: "Catálogo · Receta" };

// Receta del producto: los insumos que lleva una unidad vendida.
export default async function ProductRecipePage({
  params,
}: PageProps<"/[empresa]/catalogo/productos/[id]/receta">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "catalog.manage");
  const recipe = await getProductRecipe(session, id);
  if (!recipe) notFound();

  const slug = session.company.slug;
  const { product } = recipe;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <Link
        href={`/${slug}/catalogo/productos`}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Productos
      </Link>

      <PageHeader
        eyebrow="Catálogo · Producto"
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
      <ProductTabs companySlug={slug} productId={product.id} active="receta" />

      <CostingSummary costing={recipe.costing} price={product.price} currency={recipe.currency} />

      {recipe.hasArchivedSupplies && (
        <Alert>
          <Archive />
          <AlertDescription>
            La receta usa insumos archivados: revisa si debes reemplazarlos o quitarlos.
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ChefHat className="size-5" aria-hidden />}
          title="Receta"
          description="Los insumos que lleva una unidad vendida del producto y en qué cantidad."
        />

        {recipe.items.length > 0 ? (
          <RecipeList recipe={recipe} companySlug={slug} />
        ) : (
          <EmptyState
            icon={ChefHat}
            title="Este producto aún no tiene receta"
            text="Agrega los insumos que lleva. Si lo revendes tal cual (por ejemplo una gaseosa), agrega 1 und de su insumo."
          />
        )}

        {recipe.supplyOptions.length > 0 ? (
          <div className="border-t border-border pt-5">
            <AddRecipeItemForm
              key={recipe.items.map((item) => item.id).join()}
              companySlug={slug}
              productId={product.id}
              supplies={recipe.supplyOptions}
            />
          </div>
        ) : !recipe.hasSupplies ? (
          <EmptyState
            icon={PackageOpen}
            title="Primero registra tus insumos"
            text="La receta se arma con los insumos del inventario (harina, queso, gaseosas)."
            action={
              recipe.canViewSupplies && (
                <Button asChild variant="outline">
                  <Link href={`/${slug}/inventario/insumos/nuevo`}>Nuevo insumo</Link>
                </Button>
              )
            }
          />
        ) : (
          <p className="border-t border-border pt-5 text-sm text-muted-foreground">
            Todos tus insumos activos ya están en esta receta.
          </p>
        )}
      </section>
    </div>
  );
}
