-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'UNIT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INITIAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "minStock" DECIMAL(14,3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("warehouseId","supplyId")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_companyId_branchId_idx" ON "warehouses"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_companyId_id_key" ON "warehouses"("companyId", "id");

-- CreateIndex
CREATE INDEX "supplies_companyId_idx" ON "supplies"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "supplies_companyId_id_key" ON "supplies"("companyId", "id");

-- CreateIndex
CREATE INDEX "stock_levels_companyId_supplyId_idx" ON "stock_levels"("companyId", "supplyId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_supplyId_createdAt_idx" ON "stock_movements"("companyId", "supplyId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_warehouseId_supplyId_createdAt_idx" ON "stock_movements"("warehouseId", "supplyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_id_key" ON "branches"("companyId", "id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "branches"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_companyId_supplyId_fkey" FOREIGN KEY ("companyId", "supplyId") REFERENCES "supplies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_supplyId_fkey" FOREIGN KEY ("companyId", "supplyId") REFERENCES "supplies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Nombres únicos por empresa sin distinguir mayúsculas (Prisma no declara
-- índices sobre expresiones).
CREATE UNIQUE INDEX "warehouses_companyId_lower_name_key" ON "warehouses"("companyId", lower("name"));
CREATE UNIQUE INDEX "supplies_companyId_lower_name_key" ON "supplies"("companyId", lower("name"));

-- Una sola bodega principal por sucursal (índice parcial).
CREATE UNIQUE INDEX "warehouses_one_main_per_branch" ON "warehouses"("branchId") WHERE "isMain";

-- Reglas de cantidades también en la BD.
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_min_stock_non_negative" CHECK ("minStock" IS NULL OR "minStock" >= 0);
-- Sin stock negativo (decisión de la fase 5; el módulo de ventas la revisa).
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_non_zero" CHECK ("quantity" <> 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_initial_positive" CHECK ("type" <> 'INITIAL' OR "quantity" > 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_balance_non_negative" CHECK ("balanceAfter" >= 0);

-- Bodega principal para las sucursales ya existentes.
INSERT INTO "warehouses" ("id", "companyId", "branchId", "name", "isMain", "updatedAt")
SELECT gen_random_uuid()::text, "companyId", "id", 'Bodega principal', true, CURRENT_TIMESTAMP
FROM "branches"
WHERE "isMain";

-- Sin acceso por la API REST de Supabase (ver 20260922011536_enable_rls).
ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."supplies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;
