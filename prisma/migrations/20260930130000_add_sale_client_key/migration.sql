-- Clave del pedido del POS para no registrar dos veces la misma venta.
-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_clientKey_key" ON "sales"("companyId", "clientKey");

