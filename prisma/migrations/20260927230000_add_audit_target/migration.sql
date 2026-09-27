-- AlterTable
ALTER TABLE "auth_audit_logs" ADD COLUMN     "targetId" TEXT,
ADD COLUMN     "targetType" TEXT;

-- CreateIndex
CREATE INDEX "auth_audit_logs_targetType_targetId_idx" ON "auth_audit_logs"("targetType", "targetId");

