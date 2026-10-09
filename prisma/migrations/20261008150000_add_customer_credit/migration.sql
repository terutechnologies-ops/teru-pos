-- CreateEnum
CREATE TYPE "CustomerPaymentStatus" AS ENUM ('RECORDED', 'VOIDED');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "lastCustomerPaymentNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "isCredit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "third_parties" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tendered" DECIMAL(12,2),
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CustomerPaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_payments_companyId_customerId_createdAt_idx" ON "customer_payments"("companyId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_payments_cashSessionId_idx" ON "customer_payments"("cashSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_companyId_number_key" ON "customer_payments"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_companyId_id_key" ON "customer_payments"("companyId", "id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "third_parties"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "third_parties"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_companyId_cashSessionId_fkey" FOREIGN KEY ("companyId", "cashSessionId") REFERENCES "cash_sessions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_companyId_paymentMethodId_fkey" FOREIGN KEY ("companyId", "paymentMethodId") REFERENCES "payment_methods"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no puede declarar.

-- Método de pago "Crédito": uno por empresa y nunca efectivo a la vez.
CREATE UNIQUE INDEX "payment_methods_one_credit_per_company" ON "payment_methods"("companyId") WHERE "isCredit";
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_cash_or_credit" CHECK (NOT ("isCash" AND "isCredit"));

-- Cupo y plazo de los clientes.
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_credit_limit" CHECK ("creditLimit" >= 0);
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_credit_days" CHECK ("creditDays" BETWEEN 0 AND 365);

-- Abonos.
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_tendered" CHECK ("tendered" IS NULL OR "tendered" >= "amount");
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_number_positive" CHECK ("number" > 0);
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_note_length" CHECK ("note" IS NULL OR char_length("note") <= 200);
-- Anulado <=> con fecha, quién y motivo.
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_void_complete" CHECK (
  ("status" = 'VOIDED') = ("voidedAt" IS NOT NULL)
  AND ("voidedAt" IS NULL) = ("voidedById" IS NULL)
  AND ("voidedAt" IS NULL) = ("voidReason" IS NULL)
);

-- "Crédito" para las empresas existentes, inactivo y al final (se activa en
-- Métodos de pago). Si ya hubiera un método con ese nombre, no se crea.
INSERT INTO "payment_methods" ("id", "companyId", "name", "isCash", "isCredit", "isActive", "position", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'Crédito', false, true, false,
       COALESCE((SELECT MAX(pm."position") FROM "payment_methods" pm WHERE pm."companyId" = c."id"), 0) + 1,
       CURRENT_TIMESTAMP
FROM "companies" c
ON CONFLICT DO NOTHING;

-- RLS (como el resto de tablas: la app entra con el rol del pooler).
ALTER TABLE "public"."customer_payments" ENABLE ROW LEVEL SECURITY;
