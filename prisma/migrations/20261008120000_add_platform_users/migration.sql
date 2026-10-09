-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'PLATFORM';

-- CreateTable
CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_tokenHash_key" ON "platform_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "platform_sessions_userId_idx" ON "platform_sessions"("userId");

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas que Prisma no puede declarar.
-- El correo se guarda en minúsculas: así el índice único no admite dos
-- cuentas que solo difieren en mayúsculas.
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_name_length" CHECK (char_length("name") BETWEEN 2 AND 120);

-- RLS (como el resto de tablas: la app entra con el rol del pooler).
ALTER TABLE "public"."platform_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_sessions" ENABLE ROW LEVEL SECURITY;
