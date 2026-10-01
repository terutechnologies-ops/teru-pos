import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Métodos de pago de cada empresa. El de efectivo es único por empresa
// (índice parcial en la BD) y lo crea el sistema.

export const DEFAULT_PAYMENT_METHODS = [
  { name: "Efectivo", isCash: true },
  { name: "Tarjeta", isCash: false },
  { name: "Transferencia", isCash: false },
] as const;

// Los crea el alta de la empresa (y la migración, para las existentes).
export async function createDefaultPaymentMethods(
  tx: Prisma.TransactionClient,
  companyId: string,
) {
  await tx.paymentMethod.createMany({
    data: DEFAULT_PAYMENT_METHODS.map((method, index) => ({
      companyId,
      ...method,
      position: index + 1,
    })),
  });
}

export async function listPaymentMethods(
  companyId: string,
  filters: { activeOnly?: boolean } = {},
) {
  return db.paymentMethod.findMany({
    where: { companyId, ...(filters.activeOnly && { isActive: true }) },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isCash: true, isActive: true },
  });
}
