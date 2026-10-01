-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'CASHIER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'SALE';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_VOID';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "lastSaleNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'America/Bogota';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "saleId" TEXT;

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCash" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openingAmount" DECIMAL(12,2) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(12,2),
    "countedCash" DECIMAL(12,2),
    "closingNote" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tendered" DECIMAL(12,2),

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_methods_companyId_position_idx" ON "payment_methods"("companyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_companyId_id_key" ON "payment_methods"("companyId", "id");

-- CreateIndex
CREATE INDEX "cash_sessions_companyId_openedAt_idx" ON "cash_sessions"("companyId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_companyId_id_key" ON "cash_sessions"("companyId", "id");

-- CreateIndex
CREATE INDEX "sales_companyId_createdAt_idx" ON "sales"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_cashSessionId_idx" ON "sales"("cashSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_number_key" ON "sales"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_id_key" ON "sales"("companyId", "id");

-- CreateIndex
CREATE INDEX "sale_lines_saleId_idx" ON "sale_lines"("saleId");

-- CreateIndex
CREATE INDEX "sale_lines_companyId_productId_idx" ON "sale_lines"("companyId", "productId");

-- CreateIndex
CREATE INDEX "sale_payments_saleId_idx" ON "sale_payments"("saleId");

-- CreateIndex
CREATE INDEX "sale_payments_companyId_paymentMethodId_idx" ON "sale_payments"("companyId", "paymentMethodId");

-- CreateIndex
CREATE INDEX "stock_movements_saleId_idx" ON "stock_movements"("saleId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "sales"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "branches"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "branches"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_cashSessionId_fkey" FOREIGN KEY ("companyId", "cashSessionId") REFERENCES "cash_sessions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "sales"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "products"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "sales"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_companyId_paymentMethodId_fkey" FOREIGN KEY ("companyId", "paymentMethodId") REFERENCES "payment_methods"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- Las ventas pueden dejar el saldo negativo (ver ADR 0007). Los ajustes
-- manuales lo siguen impidiendo en la capa de datos.
ALTER TABLE "stock_levels" DROP CONSTRAINT "stock_levels_quantity_non_negative";
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_balance_non_negative";

-- Movimientos de venta: siempre enlazados a su venta y con su signo. Se
-- compara como texto porque un valor de enum recién agregado no se puede
-- usar en la misma transacción que lo agrega.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_link" CHECK (("saleId" IS NOT NULL) = ("type"::text IN ('SALE', 'SALE_VOID')));
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_sign" CHECK (("type"::text <> 'SALE' OR "quantity" < 0) AND ("type"::text <> 'SALE_VOID' OR "quantity" > 0));

-- Métodos de pago: nombre único por empresa sin distinguir mayúsculas y un
-- solo método de efectivo por empresa.
CREATE UNIQUE INDEX "payment_methods_companyId_lower_name_key" ON "payment_methods"("companyId", lower("name"));
CREATE UNIQUE INDEX "payment_methods_one_cash_per_company" ON "payment_methods"("companyId") WHERE "isCash";

-- Turnos: uno abierto por persona; el cierre guarda esperado y contado juntos.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user" ON "cash_sessions"("userId") WHERE "closedAt" IS NULL;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_non_negative" CHECK ("openingAmount" >= 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_counted_non_negative" CHECK ("countedCash" IS NULL OR "countedCash" >= 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closing_complete" CHECK (
  ("closedAt" IS NULL AND "expectedCash" IS NULL AND "countedCash" IS NULL AND "closingNote" IS NULL)
  OR ("closedAt" IS NOT NULL AND "expectedCash" IS NOT NULL AND "countedCash" IS NOT NULL)
);

-- Ventas: montos y anulación consistentes.
ALTER TABLE "sales" ADD CONSTRAINT "sales_number_positive" CHECK ("number" > 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_non_negative" CHECK ("total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_void_complete" CHECK (
  ("status" = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidReason" IS NOT NULL)
);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_unit_price_non_negative" CHECK ("unitPrice" >= 0);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_total_matches" CHECK ("lineTotal" = "unitPrice" * "quantity");
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_tendered_covers" CHECK ("tendered" IS NULL OR "tendered" >= "amount");

-- Métodos de pago iniciales de las empresas existentes (las nuevas los
-- reciben en su alta).
INSERT INTO "payment_methods" ("id", "companyId", "name", "isCash", "position", "updatedAt")
SELECT gen_random_uuid()::text, c."id", m."name", m."isCash", m."position", CURRENT_TIMESTAMP
FROM "companies" c
CROSS JOIN (VALUES ('Efectivo', true, 1), ('Tarjeta', false, 2), ('Transferencia', false, 3)) AS m("name", "isCash", "position");

-- Sin acceso por la API REST de Supabase (ver 20260922011536_enable_rls).
ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sale_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sale_payments" ENABLE ROW LEVEL SECURITY;
