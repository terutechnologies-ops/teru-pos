import "server-only";

import { Prisma } from "@/generated/prisma/client";
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

export type PaymentMethodWriteStatus = "OK" | "NOT_FOUND" | "NAME_TAKEN" | "IS_CASH";

// P2002: nombre repetido (índice único sobre lower(name)).
async function paymentMethodWrite(write: () => Promise<number>): Promise<PaymentMethodWriteStatus> {
  try {
    return (await write()) === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "NAME_TAKEN";
    }
    throw error;
  }
}

// Los que agrega una persona nunca son efectivo; quedan al final del orden.
export async function createPaymentMethod(companyId: string, name: string) {
  let id: string | null = null;
  const status = await paymentMethodWrite(() =>
    db.$transaction(async (tx) => {
      const last = await tx.paymentMethod.aggregate({
        where: { companyId },
        _max: { position: true },
      });
      ({ id } = await tx.paymentMethod.create({
        data: { companyId, name, position: (last._max.position ?? 0) + 1 },
        select: { id: true },
      }));
      return 1;
    }),
  );
  return { status, id };
}

// El efectivo es del sistema: no se renombra ni se desactiva.
async function isCashMethod(companyId: string, paymentMethodId: string) {
  const method = await db.paymentMethod.findFirst({
    where: { id: paymentMethodId, companyId },
    select: { isCash: true },
  });
  return method?.isCash ?? false;
}

export async function renamePaymentMethod(
  companyId: string,
  paymentMethodId: string,
  name: string,
): Promise<PaymentMethodWriteStatus> {
  if (await isCashMethod(companyId, paymentMethodId)) return "IS_CASH";
  return paymentMethodWrite(async () => {
    const { count } = await db.paymentMethod.updateMany({
      where: { id: paymentMethodId, companyId, isCash: false },
      data: { name },
    });
    return count;
  });
}

export async function setPaymentMethodActive(
  companyId: string,
  paymentMethodId: string,
  isActive: boolean,
): Promise<PaymentMethodWriteStatus> {
  if (!isActive && (await isCashMethod(companyId, paymentMethodId))) return "IS_CASH";
  const { count } = await db.paymentMethod.updateMany({
    where: { id: paymentMethodId, companyId, ...(!isActive && { isCash: false }) },
    data: { isActive },
  });
  return count === 1 ? "OK" : "NOT_FOUND";
}

// Sube o baja una posición, renumerando todas (1..n) como las categorías.
// false si no existe o ya está en el extremo.
export async function movePaymentMethod(
  companyId: string,
  paymentMethodId: string,
  direction: "up" | "down",
) {
  return db.$transaction(async (tx) => {
    const ordered = await tx.paymentMethod.findMany({
      where: { companyId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const index = ordered.findIndex((method) => method.id === paymentMethodId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= ordered.length) return false;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    for (const [offset, { id }] of ordered.entries()) {
      await tx.paymentMethod.update({ where: { id }, data: { position: offset + 1 } });
    }
    return true;
  });
}
