import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { calendarDay } from "@/lib/company-formats";
import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import { findCompanyCurrency, findCompanyFormats } from "@/server/data/companies";
import { listCustomerPaymentsOf } from "@/server/data/customer-payments";
import {
  createCustomer,
  customerBalances,
  findCustomer,
  listCreditSales,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
  type CreditSaleRow,
} from "@/server/data/customers";
import { CUSTOMER_EVENTS } from "@/server/services/auth/config";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import { ageCredit } from "@/server/services/credit-aging";
import { customerSchema, type CustomerInput } from "@/server/validations/third-parties";

// Clientes de crédito (cartera), con customers.manage y dentro de la empresa de
// la sesión. Cupo 0 = sin crédito. Saldo = ventas a crédito − abonos;
// disponible = cupo − saldo (nunca negativo).

const ZERO = new Prisma.Decimal(0);

type CustomerRow = Awaited<ReturnType<typeof listCustomers>>[number];

function toCustomerDto(row: CustomerRow, balance: Prisma.Decimal = ZERO) {
  const available = Prisma.Decimal.max(row.creditLimit.minus(balance), ZERO);
  return {
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    isArchived: row.isArchived,
    creditLimit: row.creditLimit.toString(),
    creditDays: row.creditDays,
    balance: balance.toString(),
    available: available.toString(),
  };
}

export type CustomerDto = ReturnType<typeof toCustomerDto>;

// Cartera: saldo y vencido de cada cliente que debe (los demás no aparecen).
async function agePortfolio(companyId: string, timeZone: string) {
  const balances = await customerBalances(companyId);
  const owing = [...balances].filter(([, value]) => value.balance.greaterThan(0));
  const sales = await listCreditSales(
    companyId,
    owing.map(([id]) => id),
  );
  const salesByCustomer = new Map<string, CreditSaleRow[]>();
  for (const sale of sales) {
    if (sale.status !== "COMPLETED") continue;
    salesByCustomer.set(sale.customerId, [...(salesByCustomer.get(sale.customerId) ?? []), sale]);
  }
  const today = calendarDay(new Date(), timeZone);
  const portfolio = new Map<string, { balance: Prisma.Decimal; overdue: Prisma.Decimal }>();
  for (const [id, value] of owing) {
    const charges = salesByCustomer.get(id) ?? [];
    const { overdue } = ageCredit(charges, value.paid, {
      creditDays: charges[0]?.creditDays ?? 0,
      timeZone,
      today,
    });
    portfolio.set(id, { balance: value.balance, overdue });
  }
  return portfolio;
}

// owing: solo los que deben (también archivados), primero lo más vencido y
// luego el saldo mayor.
export async function getCustomerList(
  session: StaffSessionDto,
  filters: { search?: string; archived?: boolean; owing?: boolean },
) {
  assertPermission(session, "customers.manage");
  const companyId = session.company.id;
  const { currency, timeZone } = await findCompanyFormats(companyId);
  const [rows, portfolio] = await Promise.all([
    listCustomers(companyId, {
      search: filters.search?.trim() || undefined,
      archived: filters.owing ? null : filters.archived,
    }),
    agePortfolio(companyId, timeZone),
  ]);

  let customers = rows.map((row) => {
    const debt = portfolio.get(row.id);
    return { ...toCustomerDto(row, debt?.balance), overdue: (debt?.overdue ?? ZERO).toString() };
  });
  if (filters.owing) {
    customers = customers
      .filter((customer) => portfolio.has(customer.id))
      .sort(
        (x, y) =>
          Number(y.overdue) - Number(x.overdue) ||
          Number(y.balance) - Number(x.balance) ||
          x.name.localeCompare(y.name, "es"),
      );
  }

  let receivable = ZERO;
  let overdue = ZERO;
  let overdueCustomers = 0;
  for (const debt of portfolio.values()) {
    receivable = receivable.plus(debt.balance);
    if (debt.overdue.greaterThan(0)) {
      overdue = overdue.plus(debt.overdue);
      overdueCustomers += 1;
    }
  }
  return {
    currency,
    customers,
    summary: {
      receivable: receivable.toString(),
      overdue: overdue.toString(),
      owingCustomers: portfolio.size,
      overdueCustomers,
    },
  };
}

export type CustomerListItem = Awaited<ReturnType<typeof getCustomerList>>["customers"][number];
export type PortfolioSummary = Awaited<ReturnType<typeof getCustomerList>>["summary"];

// Para la alerta de "Pendientes": clientes con algo vencido.
export async function countOverdueCustomers(session: StaffSessionDto) {
  assertPermission(session, "customers.manage");
  const { timeZone } = await findCompanyFormats(session.company.id);
  const portfolio = await agePortfolio(session.company.id, timeZone);
  return [...portfolio.values()].filter((debt) => debt.overdue.greaterThan(0)).length;
}

export async function getCustomer(session: StaffSessionDto, customerId: string) {
  assertPermission(session, "customers.manage");
  const companyId = session.company.id;
  const [currency, row] = await Promise.all([
    findCompanyCurrency(companyId),
    findCustomer(companyId, customerId),
  ]);
  if (!row) return null;
  const balance = (await customerBalances(companyId, [row.id])).get(row.id)?.balance;
  return { currency, customer: toCustomerDto(row, balance) };
}

// Estado de cuenta: ventas a crédito y abonos (también anulados, que no
// mueven el saldo), con el saldo después de cada movimiento y, en las ventas
// completadas, lo que falta por cubrir y su fecha límite. Del más reciente al
// más antiguo.
export async function getCustomerStatement(session: StaffSessionDto, customerId: string) {
  assertPermission(session, "customers.manage");
  const companyId = session.company.id;
  const [formats, row, sales, payments] = await Promise.all([
    findCompanyFormats(companyId),
    findCustomer(companyId, customerId),
    listCreditSales(companyId, [customerId]),
    listCustomerPaymentsOf(companyId, customerId),
  ]);
  if (!row) return null;

  const completed = sales.filter((sale) => sale.status === "COMPLETED");
  const charged = completed.reduce((sum, sale) => sum.plus(sale.amount), ZERO);
  const paid = payments
    .filter((payment) => payment.status === "RECORDED")
    .reduce((sum, payment) => sum.plus(payment.amount), ZERO);
  const today = calendarDay(new Date(), formats.timeZone);
  const aging = ageCredit(completed, paid, { creditDays: row.creditDays, timeZone: formats.timeZone, today });
  const agedById = new Map(aging.charges.map((charge) => [charge.id, charge]));

  type Entry =
    | { kind: "SALE"; id: string; number: number; at: Date; amount: Prisma.Decimal; voided: boolean }
    | {
        kind: "PAYMENT";
        id: string;
        number: number;
        at: Date;
        amount: Prisma.Decimal;
        voided: boolean;
        methodName: string;
        cashSessionId: string;
      };
  const entries: Entry[] = [
    ...sales.map((sale): Entry => ({
      kind: "SALE",
      id: sale.id,
      number: sale.number,
      at: sale.createdAt,
      amount: sale.amount,
      voided: sale.status === "VOIDED",
    })),
    ...payments.map((payment): Entry => ({
      kind: "PAYMENT",
      id: payment.id,
      number: payment.number,
      at: payment.createdAt,
      amount: payment.amount,
      voided: payment.status === "VOIDED",
      methodName: payment.paymentMethod.name,
      cashSessionId: payment.cashSessionId,
    })),
  ];
  // A la misma hora, primero el cargo: el saldo nunca se ve negativo.
  entries.sort(
    (x, y) => x.at.getTime() - y.at.getTime() || (x.kind === y.kind ? 0 : x.kind === "SALE" ? -1 : 1),
  );

  let running = ZERO;
  const movements = entries.map((entry) => {
    if (!entry.voided) {
      running = entry.kind === "SALE" ? running.plus(entry.amount) : running.minus(entry.amount);
    }
    const aged = entry.kind === "SALE" ? agedById.get(entry.id) : undefined;
    return {
      ...entry,
      amount: entry.amount.toString(),
      balance: entry.voided ? null : running.toString(),
      due: aged
        ? { day: aged.dueDay, pending: aged.pending.toString(), daysOverdue: aged.daysOverdue }
        : null,
    };
  });

  const role = session.user.role;
  return {
    ...formats,
    today,
    customer: { ...toCustomerDto(row, charged.minus(paid)), overdue: aging.overdue.toString() },
    movements: movements.reverse(),
    canViewSales: hasPermission(role, "sales.view"),
    canViewShifts: hasPermission(role, "cash.review"),
  };
}

export type CustomerStatement = NonNullable<Awaited<ReturnType<typeof getCustomerStatement>>>;
export type StatementMovement = CustomerStatement["movements"][number];

// Para el formulario de un cliente nuevo.
export async function getCustomerCurrency(session: StaffSessionDto) {
  assertPermission(session, "customers.manage");
  return findCompanyCurrency(session.company.id);
}

export type CustomerField = keyof CustomerInput;

export type SaveCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; fieldErrors: Partial<Record<CustomerField, string>>; error?: string };

export type CustomerResult = { ok: true } | { ok: false; error: string };

const CUSTOMER_GONE = "El cliente ya no existe. Actualiza la página.";

// Nombre y NIT son únicos entre todos los terceros (clientes y proveedores).
const TAKEN: Record<"NAME_TAKEN" | "TAX_ID_TAKEN", SaveCustomerResult> = {
  NAME_TAKEN: { ok: false, fieldErrors: { name: "Ya existe un proveedor o cliente con ese nombre." } },
  TAX_ID_TAKEN: { ok: false, fieldErrors: { taxId: "Ya existe un proveedor o cliente con ese NIT." } },
};

function parseCustomer(input: CustomerInput, currency: string) {
  const parsed = customerSchema(currency).safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    ok: false as const,
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
    ) as Partial<Record<CustomerField, string>>,
  };
}

function auditCredit(session: StaffSessionDto, customerId: string, ctx: RequestContext) {
  return recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action: CUSTOMER_EVENTS.CREDIT_CHANGED,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    target: { type: "THIRD_PARTY", id: customerId },
  });
}

export async function createCreditCustomer(
  session: StaffSessionDto,
  input: CustomerInput,
  ctx: RequestContext,
): Promise<SaveCustomerResult> {
  assertPermission(session, "customers.manage");
  const companyId = session.company.id;
  const parsed = parseCustomer(input, await findCompanyCurrency(companyId));
  if (!parsed.ok) return parsed;
  const { status, id } = await createCustomer(companyId, parsed.data);
  if (status === "NAME_TAKEN" || status === "TAX_ID_TAKEN") return TAKEN[status];
  if (status !== "OK" || !id) throw new Error(`createCustomer: ${status}`);
  if (Number(parsed.data.creditLimit) > 0) await auditCredit(session, id, ctx);
  return { ok: true, customerId: id };
}

export async function updateCreditCustomer(
  session: StaffSessionDto,
  customerId: string,
  input: CustomerInput,
  ctx: RequestContext,
): Promise<SaveCustomerResult> {
  assertPermission(session, "customers.manage");
  const companyId = session.company.id;
  const [currency, before] = await Promise.all([
    findCompanyCurrency(companyId),
    findCustomer(companyId, customerId),
  ]);
  if (!before) return { ok: false, fieldErrors: {}, error: CUSTOMER_GONE };
  const parsed = parseCustomer(input, currency);
  if (!parsed.ok) return parsed;
  const status = await updateCustomer(companyId, customerId, parsed.data);
  if (status === "NOT_FOUND") return { ok: false, fieldErrors: {}, error: CUSTOMER_GONE };
  if (status !== "OK") return TAKEN[status];
  const creditChanged =
    !before.creditLimit.equals(parsed.data.creditLimit) || before.creditDays !== parsed.data.creditDays;
  if (creditChanged) await auditCredit(session, customerId, ctx);
  return { ok: true, customerId };
}

export async function setCreditCustomerArchived(
  session: StaffSessionDto,
  customerId: string,
  isArchived: boolean,
): Promise<CustomerResult> {
  assertPermission(session, "customers.manage");
  const status = await setCustomerArchived(session.company.id, customerId, isArchived);
  if (status === "OK") return { ok: true };
  if (status === "HAS_BALANCE") {
    return { ok: false, error: "Este cliente tiene saldo pendiente: no se puede archivar hasta que pague." };
  }
  return { ok: false, error: CUSTOMER_GONE };
}
