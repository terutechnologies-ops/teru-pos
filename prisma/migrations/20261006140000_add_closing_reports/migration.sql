-- CreateEnum
CREATE TYPE "ClosingReportStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "closing_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ClosingReportStatus" NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "closing_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "closing_reports_companyId_createdAt_idx" ON "closing_reports"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_companyId_cashSessionId_fkey" FOREIGN KEY ("companyId", "cashSessionId") REFERENCES "cash_sessions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no puede declarar.
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_recipients_range" CHECK ("recipientCount" BETWEEN 0 AND 5);
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_sent_range" CHECK ("sentCount" BETWEEN 0 AND "recipientCount");
-- Sin destinatarios = no se envía (y al revés).
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_skipped_without_recipients" CHECK (("status" = 'SKIPPED') = ("recipientCount" = 0));
-- Terminado = con fecha de fin (los SKIPPED nacen terminados).
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_finished" CHECK (("status" = 'PENDING') = ("finishedAt" IS NULL));
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_period" CHECK ("periodStart" < "createdAt");
ALTER TABLE "closing_reports" ADD CONSTRAINT "closing_reports_error_length" CHECK ("error" IS NULL OR char_length("error") <= 500);

-- RLS (como el resto de tablas: la app entra con el rol del pooler).
ALTER TABLE "public"."closing_reports" ENABLE ROW LEVEL SECURITY;
