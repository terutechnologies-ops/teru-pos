import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/company-formats";
import { findOpenCashSession } from "@/server/data/cash-sessions";
import { findCompanyFormats, findCompanySettings } from "@/server/data/companies";
import {
  companyUsesCredit,
  findCustomerPayment,
  listSessionCustomerPayments,
  recordCustomerPayment,
  searchCustomersWithBalance,
  voidCustomerPayment,
} from "@/server/data/customer-payments";
import { listPaymentMethods } from "@/server/data/payment-methods";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import { publicFileUrl } from "@/server/services/images";
import {
  customerPaymentSchema,
  voidCustomerPaymentSchema,
  type CustomerPaymentInput,
  type VoidCustomerPaymentInput,
} from "@/server/validations/customer-payments";

// Abonos de clientes de crédito. En el POS (sales.charge) se registran en
// el turno abierto propio; en el panel, quien revisa cierres los ve en el
// turno y OWNER/ADMIN (cash.void) los anulan mientras siga abierto.

type PaymentRow = Awaited<ReturnType<typeof listSessionCustomerPayments>>[number];

// Montos como texto para la interfaz.
export function toCustomerPayment(row: PaymentRow) {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customer.id,
    customerName: row.customer.name,
    methodName: row.paymentMethod.name,
    isCash: row.paymentMethod.isCash,
    amount: row.amount.toString(),
    tendered: row.tendered?.toString() ?? null,
    balanceAfter: row.balanceAfter.toString(),
    note: row.note,
    createdAt: row.createdAt,
    userName: row.user.name,
    voided:
      row.status === "VOIDED"
        ? { at: row.voidedAt!, byName: row.voidedBy?.name ?? "", reason: row.voidReason ?? "" }
        : null,
  };
}

export type CustomerPaymentDto = ReturnType<typeof toCustomerPayment>;

// Totales sin los anulados: todos los métodos y solo efectivo (el que entra
// a la caja).
export function customerPaymentTotals(payments: CustomerPaymentDto[]) {
  const recorded = payments.filter((payment) => !payment.voided);
  const sum = (list: CustomerPaymentDto[]) =>
    list.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0)).toString();
  return {
    count: recorded.length,
    total: sum(recorded),
    cash: sum(recorded.filter((payment) => payment.isCash)),
  };
}

export type CustomerPaymentTotals = ReturnType<typeof customerPaymentTotals>;

export const PAYMENT_CUSTOMER_RESULTS = 8;
export const PAYMENT_CUSTOMER_MIN_SEARCH = 2;

// Clientes que deben, con su saldo. Quien cobra ve nombre, NIT y lo que
// debe: es lo que necesita para recibir el abono.
export async function searchPaymentCustomers(session: StaffSessionDto, search: string) {
  assertPermission(session, "sales.charge");
  const term = search.trim().slice(0, 80);
  if (term.length < PAYMENT_CUSTOMER_MIN_SEARCH) return [];
  const rows = await searchCustomersWithBalance(session.company.id, term, PAYMENT_CUSTOMER_RESULTS);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    balance: row.balance.toString(),
  }));
}

export type PaymentCustomer = Awaited<ReturnType<typeof searchPaymentCustomers>>[number];

// El POS ofrece "Abonos" solo a las empresas que venden (o vendieron) a
// crédito.
export async function offersCustomerPayments(session: StaffSessionDto) {
  assertPermission(session, "sales.charge");
  return companyUsesCredit(session.company.id);
}

// Abonos del turno abierto propio y los métodos con que se puede abonar
// (activos, menos Crédito). shift = null sin turno abierto.
export async function getShiftCustomerPayments(session: StaffSessionDto) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [formats, open, methods] = await Promise.all([
    findCompanyFormats(companyId),
    findOpenCashSession(companyId, session.user.id),
    listPaymentMethods(companyId, { activeOnly: true }),
  ]);
  const options = methods
    .filter((method) => !method.isCredit)
    .map(({ id, name, isCash }) => ({ id, name, isCash }));
  if (!open) return { ...formats, shift: null, methods: options, payments: [], totals: null };
  const payments = (await listSessionCustomerPayments(companyId, open.id)).map(toCustomerPayment);
  return {
    ...formats,
    shift: { id: open.id, branchName: open.branch.name },
    methods: options,
    payments,
    totals: customerPaymentTotals(payments),
  };
}

export type CustomerPaymentField = keyof CustomerPaymentInput;
type FieldErrors = Partial<Record<CustomerPaymentField, string>>;

export type RegisterCustomerPaymentResult =
  | {
      ok: true;
      paymentId: string;
      number: number;
      amount: string;
      balanceAfter: string;
      change: string;
    }
  | { ok: false; error: string; fieldErrors: FieldErrors };

const SHIFT_GONE = "No tienes un turno abierto. Actualiza la página.";

function fail(error: string, fieldErrors: FieldErrors = {}): RegisterCustomerPaymentResult {
  return { ok: false, error, fieldErrors };
}

export async function registerCustomerPayment(
  session: StaffSessionDto,
  input: CustomerPaymentInput,
): Promise<RegisterCustomerPaymentResult> {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = customerPaymentSchema(currency).safeParse(input);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(z.flattenError(parsed.error).fieldErrors).map(([field, errors]) => [
        field,
        (errors as string[])[0],
      ]),
    );
    return fail("Revisa los campos marcados.", fieldErrors);
  }

  const open = await findOpenCashSession(companyId, session.user.id);
  if (!open) return fail(SHIFT_GONE);
  const result = await recordCustomerPayment(companyId, {
    cashSessionId: open.id,
    userId: session.user.id,
    ...parsed.data,
  });
  switch (result.status) {
    case "OK":
      return {
        ok: true,
        paymentId: result.paymentId,
        number: result.number,
        amount: parsed.data.amount,
        balanceAfter: result.balanceAfter.toString(),
        change: result.change.toString(),
      };
    case "SESSION_NOT_FOUND":
    case "SESSION_CLOSED":
      return fail(SHIFT_GONE);
    case "CUSTOMER_NOT_FOUND":
      return fail("Ese cliente ya no existe. Búscalo de nuevo.", { customerId: "Elige el cliente." });
    case "PAYMENT_METHOD_NOT_FOUND":
      return fail("Revisa los campos marcados.", {
        paymentMethodId: "Ese método de pago ya no está disponible. Elige otro.",
      });
    case "TENDERED_NOT_CASH":
      return fail("Revisa los campos marcados.", { tendered: "Solo el efectivo admite valor recibido." });
    case "TENDERED_SHORT":
      return fail("Revisa los campos marcados.", { tendered: "Lo recibido no alcanza a cubrir el abono." });
    case "EXCEEDS_BALANCE":
      return fail("Revisa los campos marcados.", {
        amount: `${result.customerName} debe ${formatMoney(Number(result.balance), currency)}: el abono no puede ser mayor.`,
      });
  }
}

// --- Panel: anulación (cash.void) --------------------------------------------

export type VoidCustomerPaymentResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors: Partial<Record<keyof VoidCustomerPaymentInput, string>> };

const VOID_ERRORS = {
  NOT_FOUND: "El abono ya no existe. Actualiza la página.",
  ALREADY_VOIDED: "Este abono ya estaba anulado.",
  SESSION_CLOSED: "El turno de este abono ya se cerró: no se puede anular.",
} as const;

// Anula el abono: la deuda del cliente vuelve a subir y, si fue en efectivo,
// deja de contar en el esperado del turno.
export async function voidCustomerPaymentFromPanel(
  session: StaffSessionDto,
  paymentId: string,
  input: VoidCustomerPaymentInput,
): Promise<VoidCustomerPaymentResult> {
  assertPermission(session, "cash.void");
  const parsed = voidCustomerPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { reason: parsed.error.issues[0].message } };
  }
  const result = await voidCustomerPayment(session.company.id, {
    paymentId,
    userId: session.user.id,
    reason: parsed.data.reason,
  });
  return result.status === "OK"
    ? { ok: true }
    : { ok: false, error: VOID_ERRORS[result.status], fieldErrors: {} };
}

// --- Comprobante impreso -----------------------------------------------------

// Quien revisa cierres (cash.review) imprime cualquier abono; quien solo
// cobra, los de su turno abierto (como el soporte de venta). null = no existe
// o no le corresponde.
export async function getPrintableCustomerPayment(session: StaffSessionDto, paymentId: string) {
  const reviewsAll = hasPermission(session.user.role, "cash.review");
  if (!reviewsAll) assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [row, company, formats] = await Promise.all([
    findCustomerPayment(companyId, paymentId),
    findCompanySettings(companyId),
    findCompanyFormats(companyId),
  ]);
  if (!row || !company) return null;
  const own = row.cashSession.userId === session.user.id && row.cashSession.closedAt === null;
  if (!reviewsAll && !own) return null;
  const payment = toCustomerPayment(row);

  return {
    ...formats,
    company: {
      name: company.name,
      taxId: company.taxId,
      address: company.address,
      phone: company.phone,
      logoUrl: publicFileUrl(company.logoPath),
    },
    payment: {
      ...payment,
      customerTaxId: row.customer.taxId,
      cashSessionId: row.cashSessionId,
      branchName: row.cashSession.branch.name,
      change: row.tendered ? row.tendered.minus(row.amount).toString() : "0",
    },
  };
}

export type PrintableCustomerPayment = NonNullable<
  Awaited<ReturnType<typeof getPrintableCustomerPayment>>
>;
