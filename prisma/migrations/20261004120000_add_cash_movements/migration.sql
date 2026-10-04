-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('EXPENSE', 'WITHDRAWAL', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "CashMovementStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "categoryId" TEXT,
    "note" TEXT,
    "receiptPath" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CashMovementStatus" NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_categories_companyId_position_idx" ON "expense_categories"("companyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_companyId_id_key" ON "expense_categories"("companyId", "id");

-- CreateIndex
CREATE INDEX "cash_movements_cashSessionId_idx" ON "cash_movements"("cashSessionId");

-- CreateIndex
CREATE INDEX "cash_movements_companyId_createdAt_idx" ON "cash_movements"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_companyId_id_key" ON "cash_movements"("companyId", "id");

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_companyId_cashSessionId_fkey" FOREIGN KEY ("companyId", "cashSessionId") REFERENCES "cash_sessions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "expense_categories"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Categorías: nombre único por empresa sin distinguir mayúsculas.
CREATE UNIQUE INDEX "expense_categories_companyId_lower_name_key" ON "expense_categories"("companyId", lower("name"));

-- Movimientos: monto positivo; el gasto lleva categoría y solo él admite
-- foto; anulación completa; nota y motivo con tope.
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_category_on_expense" CHECK (
  ("type" = 'EXPENSE') = ("categoryId" IS NOT NULL)
);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_receipt_on_expense" CHECK (
  "receiptPath" IS NULL OR "type" = 'EXPENSE'
);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_void_complete" CHECK (
  ("status" = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidReason" IS NOT NULL)
);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_note_length" CHECK ("note" IS NULL OR char_length("note") <= 200);

-- Categorías iniciales de las empresas existentes (las nuevas las reciben
-- en su alta).
INSERT INTO "expense_categories" ("id", "companyId", "name", "position", "updatedAt")
SELECT gen_random_uuid()::text, c."id", k."name", k."position", CURRENT_TIMESTAMP
FROM "companies" c
CROSS JOIN (VALUES
  ('Domicilios y transporte', 1),
  ('Gas y servicios', 2),
  ('Aseo', 3),
  ('Compras menores', 4),
  ('Otros', 5)
) AS k("name", "position");

-- Sin acceso por la API REST de Supabase (ver 20260922011536_enable_rls).
ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cash_movements" ENABLE ROW LEVEL SECURITY;
