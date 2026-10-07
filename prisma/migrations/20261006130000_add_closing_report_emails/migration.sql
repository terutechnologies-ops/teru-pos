-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "closingReportEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Máximo 5 destinatarios del reporte de cierre (el formato y los repetidos
-- los valida la aplicación).
ALTER TABLE "companies" ADD CONSTRAINT "companies_closing_report_emails_max" CHECK (cardinality("closingReportEmails") <= 5);
