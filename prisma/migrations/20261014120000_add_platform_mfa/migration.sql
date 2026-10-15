-- Verificación en dos pasos (TOTP) del equipo Teru.

-- AlterTable
ALTER TABLE "platform_sessions" ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_users" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "platform_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_recovery_codes_codeHash_key" ON "platform_recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "platform_recovery_codes_userId_idx" ON "platform_recovery_codes"("userId");

-- AddForeignKey
ALTER TABLE "platform_recovery_codes" ADD CONSTRAINT "platform_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Solo en SQL: activada exige clave y último código; los códigos de
-- respaldo se guardan como hash SHA-256 (64 caracteres hex).
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_totp_enabled_complete"
  CHECK ("totpEnabledAt" IS NULL OR ("totpSecret" IS NOT NULL AND "totpLastStep" IS NOT NULL));
ALTER TABLE "platform_recovery_codes" ADD CONSTRAINT "platform_recovery_codes_hash_format"
  CHECK ("codeHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "public"."platform_recovery_codes" ENABLE ROW LEVEL SECURITY;
