import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { uniqueStatus, type ThirdPartyWriteStatus } from "@/server/data/third-parties";
import type { CustomerData } from "@/server/validations/third-parties";

// Clientes de crédito (terceros con isCustomer). Su saldo no se guarda: es
// lo vendido a crédito (ventas completadas, la parte pagada con el método
// Crédito) menos los abonos registrados (sin los anulados).

const customerSelect = {
  id: true,
  name: true,
  taxId: true,
  phone: true,
  email: true,
  isArchived: true,
  creditLimit: true,
  creditDays: true,
} satisfies Prisma.ThirdPartySelect;

export type CustomerBalance = { charged: Prisma.Decimal; paid: Prisma.Decimal; balance: Prisma.Decimal };

const ZERO = new Prisma.Decimal(0);

// Saldo por cliente (todos los de la empresa, o los ids indicados).
export async function customerBalances(
  companyId: string,
  customerIds?: string[],
  client: Prisma.TransactionClient = db,
): Promise<Map<string, CustomerBalance>> {
  if (customerIds?.length === 0) return new Map();
  const onlyIds = customerIds ? Prisma.sql`AND s."customerId" IN (${Prisma.join(customerIds)})` : Prisma.empty;
  const [charged, paid] = await Promise.all([
    client.$queryRaw<{ customerId: string; total: Prisma.Decimal }[]>`
      SELECT s."customerId", SUM(sp."amount") AS "total"
      FROM "sale_payments" sp
      JOIN "sales" s ON s."id" = sp."saleId"
      JOIN "payment_methods" pm ON pm."id" = sp."paymentMethodId"
      WHERE sp."companyId" = ${companyId}
        AND s."status" = 'COMPLETED'
        AND pm."isCredit"
        AND s."customerId" IS NOT NULL
        ${onlyIds}
      GROUP BY s."customerId"`,
    client.customerPayment.groupBy({
      by: ["customerId"],
      where: { companyId, status: "RECORDED", ...(customerIds && { customerId: { in: customerIds } }) },
      _sum: { amount: true },
    }),
  ]);
  const balances = new Map<string, CustomerBalance>();
  const entry = (id: string) => {
    const current = balances.get(id) ?? { charged: ZERO, paid: ZERO, balance: ZERO };
    balances.set(id, current);
    return current;
  };
  for (const row of charged) entry(row.customerId).charged = new Prisma.Decimal(row.total);
  for (const row of paid) entry(row.customerId).paid = row._sum.amount ?? ZERO;
  for (const value of balances.values()) value.balance = value.charged.minus(value.paid);
  return balances;
}

export async function listCustomers(
  companyId: string,
  filters: { search?: string; archived?: boolean } = {},
) {
  const search = filters.search;
  return db.thirdParty.findMany({
    where: {
      companyId,
      isCustomer: true,
      isArchived: filters.archived ?? false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { taxId: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    },
    orderBy: { name: "asc" },
    select: customerSelect,
  });
}

export async function findCustomer(companyId: string, customerId: string) {
  return db.thirdParty.findFirst({
    where: { id: customerId, companyId, isCustomer: true },
    select: customerSelect,
  });
}

export async function createCustomer(
  companyId: string,
  data: CustomerData,
): Promise<{ status: ThirdPartyWriteStatus; id?: string }> {
  try {
    const customer = await db.thirdParty.create({
      data: { companyId, ...data, isCustomer: true },
      select: { id: true },
    });
    return { status: "OK", id: customer.id };
  } catch (error) {
    const status = uniqueStatus(error);
    if (status) return { status };
    throw error;
  }
}

export async function updateCustomer(
  companyId: string,
  customerId: string,
  data: CustomerData,
): Promise<ThirdPartyWriteStatus> {
  try {
    const { count } = await db.thirdParty.updateMany({
      where: { id: customerId, companyId, isCustomer: true },
      data,
    });
    return count === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    const status = uniqueStatus(error);
    if (status) return status;
    throw error;
  }
}

// Archivar exige saldo en cero (con el cliente bloqueado, para que una venta
// a crédito simultánea no deje deuda en un cliente archivado). Restaurar no.
export async function setCustomerArchived(
  companyId: string,
  customerId: string,
  isArchived: boolean,
): Promise<"OK" | "NOT_FOUND" | "HAS_BALANCE"> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "third_parties"
      WHERE "id" = ${customerId} AND "companyId" = ${companyId} AND "isCustomer"
      FOR UPDATE`;
    if (locked.length === 0) return "NOT_FOUND";
    if (isArchived) {
      const balance = (await customerBalances(companyId, [customerId], tx)).get(customerId)?.balance;
      if (balance && !balance.isZero()) return "HAS_BALANCE";
    }
    await tx.thirdParty.update({ where: { id: customerId }, data: { isArchived } });
    return "OK";
  });
}
