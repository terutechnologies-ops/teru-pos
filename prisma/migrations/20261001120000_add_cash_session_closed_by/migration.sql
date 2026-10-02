-- Quién cerró el turno: su dueño o, si lo olvidó, un administrador desde
-- el panel (cash.close). Los turnos ya cerrados los cerró su dueño.
ALTER TABLE "cash_sessions" ADD COLUMN "closedById" TEXT;
UPDATE "cash_sessions" SET "closedById" = "userId" WHERE "closedAt" IS NOT NULL;

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El cierre completo ahora incluye quién cerró.
ALTER TABLE "cash_sessions" DROP CONSTRAINT "cash_sessions_closing_complete";
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closing_complete" CHECK (
  ("closedAt" IS NULL AND "expectedCash" IS NULL AND "countedCash" IS NULL AND "closingNote" IS NULL AND "closedById" IS NULL)
  OR ("closedAt" IS NOT NULL AND "expectedCash" IS NOT NULL AND "countedCash" IS NOT NULL AND "closedById" IS NOT NULL)
);

-- Cerrar el turno de otra persona exige el motivo (va en closingNote).
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_other_close_reason" CHECK (
  "closedById" IS NULL OR "closedById" = "userId" OR "closingNote" IS NOT NULL
);
