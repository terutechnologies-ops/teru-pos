-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "deactivationReason" TEXT;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Empresas ya inactivas (antes del panel Teru): fecha de su última
-- actualización y un motivo genérico, para cumplir las reglas de abajo.
UPDATE "companies"
SET "deactivatedAt" = "updatedAt", "deactivationReason" = 'Desactivada antes del panel del equipo Teru.'
WHERE "isActive" = false;

-- Reglas que Prisma no puede declarar.
-- Inactiva <=> con fecha y motivo (quién puede quedar null: script o cuenta
-- borrada).
ALTER TABLE "companies" ADD CONSTRAINT "companies_deactivation_complete" CHECK (
  ("isActive" = ("deactivatedAt" IS NULL)) AND (("deactivatedAt" IS NULL) = ("deactivationReason" IS NULL))
);
ALTER TABLE "companies" ADD CONSTRAINT "companies_deactivation_reason_length" CHECK (
  "deactivationReason" IS NULL OR char_length("deactivationReason") BETWEEN 3 AND 200
);
