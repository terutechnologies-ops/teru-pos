-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'COUNT';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "lastInventoryCountNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "inventoryCountId" TEXT;

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER,
    "warehouseId" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "countedQuantity" DECIMAL(14,3) NOT NULL,
    "systemQuantity" DECIMAL(17,6),
    "difference" DECIMAL(17,6),
    "unitCost" DECIMAL(14,4),
    "periodStart" TIMESTAMP(3),
    "previousCounted" DECIMAL(14,3),
    "soldQuantity" DECIMAL(17,6),
    "purchasedQuantity" DECIMAL(17,6),
    "adjustedQuantity" DECIMAL(17,6),

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_counts_companyId_warehouseId_idx" ON "inventory_counts"("companyId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_companyId_number_key" ON "inventory_counts"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_companyId_id_key" ON "inventory_counts"("companyId", "id");

-- CreateIndex
CREATE INDEX "inventory_count_lines_companyId_supplyId_idx" ON "inventory_count_lines"("companyId", "supplyId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_countId_supplyId_key" ON "inventory_count_lines"("countId", "supplyId");

-- CreateIndex
CREATE INDEX "stock_movements_inventoryCountId_idx" ON "stock_movements"("inventoryCountId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_inventoryCountId_fkey" FOREIGN KEY ("companyId", "inventoryCountId") REFERENCES "inventory_counts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_companyId_countId_fkey" FOREIGN KEY ("companyId", "countId") REFERENCES "inventory_counts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_companyId_supplyId_fkey" FOREIGN KEY ("companyId", "supplyId") REFERENCES "supplies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Movimientos de conteo: siempre enlazados a su conteo (por texto: el valor
-- de enum recién agregado no se puede usar en esta misma transacción). El
-- signo es libre (la diferencia sale o entra); cantidad <> 0 ya existe.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_count_link" CHECK (("inventoryCountId" IS NOT NULL) = ("type"::text = 'COUNT'));

-- Un solo borrador por bodega.
CREATE UNIQUE INDEX "inventory_counts_one_draft_per_warehouse" ON "inventory_counts"("warehouseId") WHERE "status" = 'DRAFT';

-- Conteos: número solo al confirmar; confirmación completa.
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_number_positive" CHECK ("number" IS NULL OR "number" > 0);
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_number_when_confirmed" CHECK (("status" = 'DRAFT') = ("number" IS NULL));
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_confirm_complete" CHECK (
  ("status" = 'DRAFT') = ("confirmedAt" IS NULL AND "confirmedById" IS NULL)
);

-- Líneas: lo contado no es negativo; los datos de confirmación van todos o
-- ninguno, y la diferencia es contado − sistema.
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_counted_non_negative" CHECK ("countedQuantity" >= 0);
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_confirm_complete" CHECK (
  ("systemQuantity" IS NULL AND "difference" IS NULL AND "soldQuantity" IS NULL
    AND "purchasedQuantity" IS NULL AND "adjustedQuantity" IS NULL
    AND "unitCost" IS NULL AND "periodStart" IS NULL AND "previousCounted" IS NULL)
  OR ("systemQuantity" IS NOT NULL AND "difference" IS NOT NULL AND "soldQuantity" IS NOT NULL
    AND "purchasedQuantity" IS NOT NULL AND "adjustedQuantity" IS NOT NULL)
);
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_difference" CHECK (
  "difference" IS NULL OR "difference" = "countedQuantity" - "systemQuantity"
);
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_previous_period" CHECK (
  ("periodStart" IS NULL) = ("previousCounted" IS NULL)
);
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_unit_cost_non_negative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0);

-- Sin acceso por la API REST de Supabase (ver 20260922011536_enable_rls).
ALTER TABLE "public"."inventory_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory_count_lines" ENABLE ROW LEVEL SECURITY;
