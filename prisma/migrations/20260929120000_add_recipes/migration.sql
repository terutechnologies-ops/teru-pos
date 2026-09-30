-- AlterTable
ALTER TABLE "supplies" ADD COLUMN     "unitCost" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "product_recipe_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_recipe_items_companyId_supplyId_idx" ON "product_recipe_items"("companyId", "supplyId");

-- CreateIndex
CREATE UNIQUE INDEX "product_recipe_items_productId_supplyId_key" ON "product_recipe_items"("productId", "supplyId");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_id_key" ON "products"("companyId", "id");

-- AddForeignKey
ALTER TABLE "product_recipe_items" ADD CONSTRAINT "product_recipe_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_items" ADD CONSTRAINT "product_recipe_items_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "products"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_items" ADD CONSTRAINT "product_recipe_items_companyId_supplyId_fkey" FOREIGN KEY ("companyId", "supplyId") REFERENCES "supplies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de cantidades y costos también en la BD.
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_unit_cost_non_negative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0);
ALTER TABLE "product_recipe_items" ADD CONSTRAINT "product_recipe_items_quantity_positive" CHECK ("quantity" > 0);

-- Sin acceso por la API REST de Supabase (ver 20260922011536_enable_rls).
ALTER TABLE "public"."product_recipe_items" ENABLE ROW LEVEL SECURITY;
