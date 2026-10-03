-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE';
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_VOID';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "lastPurchaseNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "third_parties" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "third_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplierInvoice" TEXT,
    "purchasedOn" DATE NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "third_parties_companyId_idx" ON "third_parties"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "third_parties_companyId_id_key" ON "third_parties"("companyId", "id");

-- CreateIndex
CREATE INDEX "purchases_companyId_purchasedOn_idx" ON "purchases"("companyId", "purchasedOn");

-- CreateIndex
CREATE INDEX "purchases_companyId_supplierId_idx" ON "purchases"("companyId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_companyId_number_key" ON "purchases"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_companyId_id_key" ON "purchases"("companyId", "id");

-- CreateIndex
CREATE INDEX "purchase_lines_companyId_supplyId_idx" ON "purchase_lines"("companyId", "supplyId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lines_purchaseId_supplyId_key" ON "purchase_lines"("purchaseId", "supplyId");

-- CreateIndex
CREATE INDEX "stock_movements_purchaseId_idx" ON "stock_movements"("purchaseId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "third_parties"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_companyId_supplyId_fkey" FOREIGN KEY ("companyId", "supplyId") REFERENCES "supplies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;





-- Terceros: nombre único por empresa sin distinguir mayúsculas, NIT único
-- por empresa si se escribe y al menos un papel.
CREATE UNIQUE INDEX "third_parties_companyId_lower_name_key" ON "third_parties"("companyId", lower("name"));
CREATE UNIQUE INDEX "third_parties_companyId_taxId_key" ON "third_parties"("companyId", "taxId") WHERE "taxId" IS NOT NULL;
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_has_role" CHECK ("isSupplier" OR "isCustomer");

-- Movimientos de compra: siempre enlazados a su compra y con su signo. Se
-- compara como texto porque un valor de enum recién agregado no se puede
-- usar en la misma transacción que lo agrega.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_link" CHECK (("purchaseId" IS NOT NULL) = ("type"::text IN ('PURCHASE', 'PURCHASE_VOID')));
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_sign" CHECK (("type"::text <> 'PURCHASE' OR "quantity" > 0) AND ("type"::text <> 'PURCHASE_VOID' OR "quantity" < 0));

-- Compras: número solo al confirmar; confirmación y anulación completas.
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_number_positive" CHECK ("number" IS NULL OR "number" > 0);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_number_when_confirmed" CHECK (("status" = 'DRAFT') = ("number" IS NULL));
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_confirm_complete" CHECK (
  ("status" = 'DRAFT') = ("confirmedAt" IS NULL AND "confirmedById" IS NULL)
);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_void_complete" CHECK (
  ("status" = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidReason" IS NOT NULL)
);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_non_negative" CHECK ("total" >= 0);
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_position_positive" CHECK ("position" > 0);
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_total_non_negative" CHECK ("lineTotal" >= 0);

-- Sin acceso por la API REST de Supabase (ver 20260922011536_enable_rls).
ALTER TABLE "public"."third_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."purchase_lines" ENABLE ROW LEVEL SECURITY;
