-- Cantidades de inventario con 6 decimales: una receta en g de un insumo en
-- kg se descuenta sin redondear (0,5 g = 0,0005 kg). Ver ADR 0007.
-- AlterTable
ALTER TABLE "stock_levels" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(17,6);

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(17,6),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(17,6);

