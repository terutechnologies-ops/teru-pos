-- AlterTable
ALTER TABLE "supplies" ADD COLUMN     "idealStock" DECIMAL(14,3);

-- Existencia ideal no negativa (como el mínimo). Que no sea menor que el
-- mínimo lo valida la aplicación.
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_ideal_stock_non_negative" CHECK ("idealStock" IS NULL OR "idealStock" >= 0);
