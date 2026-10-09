-- CreateTable
CREATE TABLE "company_status_changes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "reason" TEXT,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_status_changes_companyId_createdAt_idx" ON "company_status_changes"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "company_status_changes" ADD CONSTRAINT "company_status_changes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_status_changes" ADD CONSTRAINT "company_status_changes_byId_fkey" FOREIGN KEY ("byId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reglas que Prisma no puede declarar.
-- Desactivar lleva motivo (3–200); reactivar, no.
ALTER TABLE "company_status_changes" ADD CONSTRAINT "company_status_changes_reason" CHECK (
  ("isActive" AND "reason" IS NULL)
  OR (NOT "isActive" AND "reason" IS NOT NULL AND char_length("reason") BETWEEN 3 AND 200)
);

-- Empresas ya desactivadas: su desactivación vigente como primer registro.
INSERT INTO "company_status_changes" ("id", "companyId", "isActive", "reason", "byId", "createdAt")
SELECT 'csc_' || "id", "id", false, "deactivationReason", "deactivatedById", "deactivatedAt"
FROM "companies"
WHERE "isActive" = false;

-- RLS (como el resto de tablas: la app entra con el rol del pooler).
ALTER TABLE "public"."company_status_changes" ENABLE ROW LEVEL SECURITY;
