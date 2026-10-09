import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import { findCompanyCurrency } from "@/server/data/companies";
import {
  createCustomer,
  customerBalances,
  findCustomer,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from "@/server/data/customers";
import { CUSTOMER_EVENTS } from "@/server/services/auth/config";
import { assertPermission } from "@/server/services/auth/permissions";
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

export async function getCustomerList(
  session: StaffSessionDto,
  filters: { search?: string; archived?: boolean },
) {
  assertPermission(session, "customers.manage");
  const companyId = session.company.id;
  const [currency, rows, balances] = await Promise.all([
    findCompanyCurrency(companyId),
    listCustomers(companyId, { search: filters.search?.trim() || undefined, archived: filters.archived }),
    customerBalances(companyId),
  ]);
  return {
    currency,
    customers: rows.map((row) => toCustomerDto(row, balances.get(row.id)?.balance)),
  };
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
