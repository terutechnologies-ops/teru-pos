import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CASH_TX_OPTIONS, lockCashSession } from "@/server/data/cash-sessions";
import { customerBalances, lockCustomer } from "@/server/data/customers";

// Abonos de clientes de crédito (cartera). Se registran en el POS, en el
// turno abierto de quien los recibe; los de efectivo cuentan en el cuadre.
// Van a la cuenta del cliente (no a una venta) y nunca superan su saldo: no
// hay saldo a favor. Se anulan desde el panel mientras el turno siga
// abierto. Montos como texto decimal ya validado.

const ZERO = new Prisma.Decimal(0);

// Clientes que deben algo (aunque hoy tengan cupo 0), por nombre o NIT,
// con su saldo: el buscador de abonos del POS. Se buscan candidatos y se
// filtran por saldo (el saldo no se guarda: se calcula).
export async function searchCustomersWithBalance(companyId: string, search: string, take: number) {
  const candidates = await db.thirdParty.findMany({
    where: {
      companyId,
      isCustomer: true,
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 100,
    select: { id: true, name: true, taxId: true },
  });
  const balances = await customerBalances(
    companyId,
    candidates.map((customer) => customer.id),
  );
  return candidates
    .map((customer) => ({ ...customer, balance: balances.get(customer.id)?.balance ?? ZERO }))
    .filter((customer) => customer.balance.greaterThan(0))
    .slice(0, take);
}

export type RecordCustomerPaymentInput = {
  cashSessionId: string;
  // Quien recibe: debe ser el dueño del turno.
  userId: string;
  customerId: string;
  paymentMethodId: string;
  amount: string;
  // Solo efectivo: lo que entregó el cliente (null = justo).
  tendered: string | null;
  note: string | null;
};

export type RecordCustomerPaymentResult =
  | {
      status: "OK";
      paymentId: string;
      number: number;
      balanceAfter: Prisma.Decimal;
      change: Prisma.Decimal;
    }
  | {
      status:
        | "SESSION_NOT_FOUND"
        | "SESSION_CLOSED"
        | "CUSTOMER_NOT_FOUND"
        // Inexistente, inactivo o el método Crédito.
        | "PAYMENT_METHOD_NOT_FOUND"
        | "TENDERED_NOT_CASH"
        | "TENDERED_SHORT";
    }
  // El abono supera lo que debe el cliente.
  | { status: "EXCEEDS_BALANCE"; customerName: string; balance: Prisma.Decimal };

// Orden de bloqueo como una venta a crédito: turno (compartido) → cliente.
export async function recordCustomerPayment(
  companyId: string,
  input: RecordCustomerPaymentInput,
): Promise<RecordCustomerPaymentResult> {
  return db.$transaction(async (tx) => {
    const session = await lockCashSession(tx, companyId, input.cashSessionId, "SHARE");
    if (!session || session.userId !== input.userId) return { status: "SESSION_NOT_FOUND" };
    if (session.closedAt) return { status: "SESSION_CLOSED" };

    const method = await tx.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, companyId, isActive: true, isCredit: false },
      select: { isCash: true },
    });
    if (!method) return { status: "PAYMENT_METHOD_NOT_FOUND" };
    const amount = new Prisma.Decimal(input.amount);
    let change = ZERO;
    if (input.tendered !== null) {
      if (!method.isCash) return { status: "TENDERED_NOT_CASH" };
      const tendered = new Prisma.Decimal(input.tendered);
      if (tendered.lessThan(amount)) return { status: "TENDERED_SHORT" };
      change = tendered.minus(amount);
    }

    // Un cliente archivado tiene saldo 0, así que tampoco pasaría.
    const customer = await lockCustomer(tx, companyId, input.customerId);
    if (!customer) return { status: "CUSTOMER_NOT_FOUND" };
    const balance =
      (await customerBalances(companyId, [input.customerId], tx)).get(input.customerId)?.balance ??
      ZERO;
    if (amount.greaterThan(balance)) {
      return { status: "EXCEEDS_BALANCE", customerName: customer.name, balance };
    }
    const balanceAfter = balance.minus(amount);

    // El consecutivo al final, como en las ventas.
    const [{ lastCustomerPaymentNumber: number }] = await tx.$queryRaw<
      { lastCustomerPaymentNumber: number }[]
    >`
      UPDATE "companies" SET "lastCustomerPaymentNumber" = "lastCustomerPaymentNumber" + 1
      WHERE "id" = ${companyId}
      RETURNING "lastCustomerPaymentNumber"`;

    const payment = await tx.customerPayment.create({
      data: {
        companyId,
        number,
        customerId: input.customerId,
        cashSessionId: input.cashSessionId,
        paymentMethodId: input.paymentMethodId,
        amount,
        tendered: input.tendered === null ? null : new Prisma.Decimal(input.tendered),
        balanceAfter,
        note: input.note,
        userId: input.userId,
      },
      select: { id: true },
    });
    return { status: "OK", paymentId: payment.id, number, balanceAfter, change };
  }, CASH_TX_OPTIONS);
}

export type VoidCustomerPaymentResult = {
  status: "OK" | "NOT_FOUND" | "ALREADY_VOIDED" | "SESSION_CLOSED";
};

// Anular devuelve el monto a la deuda del cliente (puede quedar por encima
// de su cupo: ya se le había vendido). Con el turno cerrado no: el cierre
// guardó el esperado.
export async function voidCustomerPayment(
  companyId: string,
  input: { paymentId: string; userId: string; reason: string },
): Promise<VoidCustomerPaymentResult> {
  return db.$transaction(async (tx) => {
    const payment = await tx.customerPayment.findFirst({
      where: { id: input.paymentId, companyId },
      select: { cashSessionId: true, customerId: true },
    });
    if (!payment) return { status: "NOT_FOUND" };
    const session = await lockCashSession(tx, companyId, payment.cashSessionId, "SHARE");
    if (!session) return { status: "NOT_FOUND" };
    if (session.closedAt) return { status: "SESSION_CLOSED" };
    await lockCustomer(tx, companyId, payment.customerId);

    // Solo cambia si sigue registrado: dos anulaciones a la vez no pasan.
    const { count } = await tx.customerPayment.updateMany({
      where: { id: input.paymentId, companyId, status: "RECORDED" },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
      },
    });
    return { status: count === 1 ? "OK" : "ALREADY_VOIDED" };
  }, CASH_TX_OPTIONS);
}

const paymentSelect = {
  id: true,
  number: true,
  amount: true,
  tendered: true,
  balanceAfter: true,
  note: true,
  status: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  customer: { select: { id: true, name: true, taxId: true } },
  paymentMethod: { select: { name: true, isCash: true } },
  user: { select: { name: true } },
  voidedBy: { select: { name: true } },
} satisfies Prisma.CustomerPaymentSelect;

// Abonos de un turno, del más antiguo al más reciente (también los anulados).
export async function listSessionCustomerPayments(companyId: string, cashSessionId: string) {
  return db.customerPayment.findMany({
    where: { companyId, cashSessionId },
    orderBy: { createdAt: "asc" },
    select: paymentSelect,
  });
}

// Un abono con lo necesario para el comprobante y el correo.
export async function findCustomerPayment(companyId: string, paymentId: string) {
  return db.customerPayment.findFirst({
    where: { id: paymentId, companyId },
    select: {
      ...paymentSelect,
      customer: { select: { id: true, name: true, taxId: true, email: true } },
      cashSessionId: true,
      cashSession: {
        select: { userId: true, closedAt: true, branch: { select: { name: true } } },
      },
    },
  });
}

// Abonos de un cliente (también los anulados), del más antiguo al más
// reciente: su estado de cuenta.
export async function listCustomerPaymentsOf(companyId: string, customerId: string) {
  return db.customerPayment.findMany({
    where: { companyId, customerId },
    orderBy: [{ createdAt: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      createdAt: true,
      amount: true,
      status: true,
      cashSessionId: true,
      paymentMethod: { select: { name: true } },
    },
  });
}

// Abonos en efectivo no anulados de un turno: entran al esperado de caja.
export async function sumSessionCashPayments(companyId: string, cashSessionId: string) {
  const result = await db.customerPayment.aggregate({
    where: { companyId, cashSessionId, status: "RECORDED", paymentMethod: { isCash: true } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? ZERO;
}

// La empresa vende o vendió a crédito: el método Crédito está activo o hay
// ventas con cliente (si se desactivó, todavía puede haber deudas que
// cobrar).
export async function companyUsesCredit(companyId: string) {
  const [active, sale] = await Promise.all([
    db.paymentMethod.count({ where: { companyId, isCredit: true, isActive: true } }),
    db.sale.findFirst({ where: { companyId, customerId: { not: null } }, select: { id: true } }),
  ]);
  return active > 0 || sale !== null;
}
