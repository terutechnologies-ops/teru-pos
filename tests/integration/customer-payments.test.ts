import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/company-formats";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { expectedCash } from "@/server/data/cash-sessions";
import { findClosingReportPeriod } from "@/server/data/closing-reports";
import { createSupply } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  closeShift,
  getCashSessionReview,
  getClosedShift,
  getPrintableShift,
  openShift,
} from "@/server/services/cash-sessions";
import {
  buildCustomerPaymentEmail,
  sendCustomerPaymentEmail,
} from "@/server/services/customer-payment-email";
import {
  getPrintableCustomerPayment,
  getShiftCustomerPayments,
  offersCustomerPayments,
  registerCustomerPayment,
  searchPaymentCustomers,
  voidCustomerPaymentFromPanel,
} from "@/server/services/customer-payments";
import { createCreditCustomer, getCustomer } from "@/server/services/customers";
import { setMessageSenderForTesting, type OutgoingEmail } from "@/server/services/messaging";
import { checkout } from "@/server/services/sales";

import { cleanupCompanies, createCompany, createMainBranch, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("abonos");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let owner: StaffSessionDto;
let ana: StaffSessionDto;
let beto: StaffSessionDto;
let staff: StaffSessionDto;
let cash: string;
let card: string;
let credit: string;
let transfer: string;
let arepa: string;
let laEsquina: string;
let donPedro: string;
let sinDeuda: string;
let ajeno: string;
let anaShift: string;

const $ = (amount: number) => formatMoney(amount, "COP");

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function customer(session: StaffSessionDto, name: string, extra: Record<string, string> = {}) {
  const result = await createCreditCustomer(
    session,
    { name, taxId: "", phone: "", email: "", creditLimit: "500.000", creditDays: "30", ...extra },
    ctx(tag),
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.customerId;
}

// Deuda: venta a crédito de arepas (16.500 c/u) en el turno de quien cobra.
async function owe(session: StaffSessionDto, customerId: string, quantity: number) {
  const result = await checkout(session, {
    clientKey: randomUUID(),
    lines: [{ productId: arepa, quantity }],
    payments: [{ paymentMethodId: credit, amount: String(16500 * quantity) }],
    customerId,
  });
  if (!result.ok) throw new Error(result.error);
}

function pay(
  session: StaffSessionDto,
  customerId: string,
  amount: string,
  extra: Partial<Record<"paymentMethodId" | "tendered" | "note", string>> = {},
) {
  return registerCustomerPayment(session, {
    customerId,
    paymentMethodId: cash,
    amount,
    tendered: "",
    note: "",
    ...extra,
  });
}

async function balance(customerId: string) {
  return (await getCustomer(owner, customerId))!.customer.balance;
}

function captureEmails() {
  const sent: OutgoingEmail[] = [];
  setMessageSenderForTesting({
    async sendEmail(message) {
      sent.push(message);
    },
  });
  return sent;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Arepas Prueba");
  b = await createCompany(`${tag}-b`);
  await createMainBranch(a.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, b.id));
  const methods = await db.paymentMethod.findMany({ where: { companyId: a.id } });
  cash = methods.find((m) => m.isCash)!.id;
  credit = methods.find((m) => m.isCredit)!.id;
  card = methods.find((m) => m.name === "Tarjeta")!.id;
  transfer = methods.find((m) => m.name === "Transferencia")!.id;

  await createProductCategory(a.id, "Arepas");
  const categoryId = (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id } })).id;
  const harina = (
    await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, idealStock: null, unitCost: null })
  ).id!;
  arepa = (await createProduct(a.id, { categoryId, name: "Arepa", description: null, price: "16500" })).id!;
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });

  const user = (email: string, role: StaffRole) => createUser({ companyId: a.id, email: `${email}@${tag}.co`, role });
  owner = sessionFor(a, (await user("dueno", "OWNER")).id, "OWNER");
  ana = sessionFor(a, (await user("ana", "CASHIER")).id, "CASHIER");
  beto = sessionFor(a, (await user("beto", "CASHIER")).id, "CASHIER");
  staff = sessionFor(a, (await user("personal", "STAFF")).id, "STAFF");
  const ownerB = sessionFor(b, (await createUser({ companyId: b.id, email: `b@${tag}.co`, role: "OWNER" })).id, "OWNER");

  laEsquina = await customer(owner, "Restaurante La Esquina", { taxId: "900111", email: "esquina@cliente.co" });
  donPedro = await customer(owner, "Don Pedro");
  sinDeuda = await customer(owner, "Esquina Sin Deuda");
  ajeno = await customer(ownerB, "La Esquina Ajena");
});
afterEach(() => setMessageSenderForTesting(null));
afterAll(() => cleanupCompanies(tag));

describe("abonos en el POS", () => {
  it("el POS ofrece abonos solo si la empresa vende a crédito", async () => {
    expect(await offersCustomerPayments(ana)).toBe(false);
    await db.paymentMethod.update({ where: { id: credit }, data: { isActive: true } });
    expect(await offersCustomerPayments(ana)).toBe(true);
    await expect(offersCustomerPayments(staff)).rejects.toThrow(ForbiddenError);
  });

  it("busca solo clientes que deben (aunque su cupo sea 0), con su saldo", async () => {
    const opened = await openShift(ana, { branchId: "", openingAmount: "100.000" });
    if (!opened.ok) throw new Error(opened.error);
    anaShift = opened.cashSessionId;
    await owe(ana, laEsquina, 4); // 66.000
    await owe(ana, donPedro, 2); // 33.000
    // Bajarle el cupo a 0 no esconde la deuda.
    await db.thirdParty.update({ where: { id: donPedro }, data: { creditLimit: 0 } });

    expect(await searchPaymentCustomers(ana, "e")).toEqual([]);
    expect(await searchPaymentCustomers(ana, "esquina")).toEqual([
      { id: laEsquina, name: "Restaurante La Esquina", taxId: "900111", balance: "66000" },
    ]);
    expect((await searchPaymentCustomers(ana, "Pedro")).map((c) => c.balance)).toEqual(["33000"]);
    await expect(searchPaymentCustomers(staff, "Pedro")).rejects.toThrow(ForbiddenError);
  });

  it("registra un abono en efectivo con cambio, número y saldo; cuenta en el esperado", async () => {
    const result = await pay(ana, laEsquina, "40.000", { tendered: "50.000", note: " quincena " });
    expect(result).toMatchObject({ ok: true, number: 1, amount: "40000", balanceAfter: "26000", change: "10000" });
    expect(await balance(laEsquina)).toBe("26000");

    // Con tarjeta no entra a la caja.
    expect(await pay(ana, donPedro, "13.000", { paymentMethodId: card })).toMatchObject({
      ok: true,
      number: 2,
      balanceAfter: "20000",
      change: "0",
    });

    const shift = await getShiftCustomerPayments(ana);
    expect(shift.methods.map((m) => m.name)).toEqual(["Efectivo", "Tarjeta", "Transferencia"]); // sin Crédito
    expect(shift.payments.map((p) => [p.number, p.customerName, p.methodName, p.note])).toEqual([
      [1, "Restaurante La Esquina", "Efectivo", "quincena"],
      [2, "Don Pedro", "Tarjeta", null],
    ]);
    expect(shift.totals).toEqual({ count: 2, total: "53000", cash: "40000" });
    // 100.000 de fondo + 40.000 del abono en efectivo (las ventas fueron a crédito).
    expect((await expectedCash(db, a.id, anaShift)).toString()).toBe("140000");
  });

  it("valida el abono y no deja abonar más de lo que debe", async () => {
    expect(await pay(ana, laEsquina, "")).toMatchObject({
      ok: false,
      fieldErrors: { amount: expect.any(String) },
    });
    expect(await pay(ana, laEsquina, "10.000", { tendered: "5.000" })).toMatchObject({
      ok: false,
      fieldErrors: { tendered: "Lo recibido no alcanza a cubrir el abono." },
    });
    expect(await pay(ana, laEsquina, "26.001")).toMatchObject({
      ok: false,
      fieldErrors: { amount: `Restaurante La Esquina debe ${$(26000)}: el abono no puede ser mayor.` },
    });
    expect(await pay(ana, sinDeuda, "1.000")).toMatchObject({
      ok: false,
      fieldErrors: { amount: `Esquina Sin Deuda debe ${$(0)}: el abono no puede ser mayor.` },
    });
    // Crédito nunca; un método inactivo tampoco.
    await db.paymentMethod.update({ where: { id: transfer }, data: { isActive: false } });
    for (const methodId of [credit, transfer]) {
      expect(await pay(ana, laEsquina, "1.000", { paymentMethodId: methodId })).toMatchObject({
        ok: false,
        fieldErrors: { paymentMethodId: "Ese método de pago ya no está disponible. Elige otro." },
      });
    }
    expect(await pay(ana, laEsquina, "1.000", { paymentMethodId: card, tendered: "2.000" })).toMatchObject({
      ok: false,
      fieldErrors: { tendered: "Solo el efectivo admite valor recibido." },
    });
    expect(await pay(ana, ajeno, "1.000")).toMatchObject({ ok: false, error: "Ese cliente ya no existe. Búscalo de nuevo." });
    expect(await pay(beto, laEsquina, "1.000")).toMatchObject({
      ok: false,
      error: "No tienes un turno abierto. Actualiza la página.",
    });
    await expect(pay(staff, laEsquina, "1.000")).rejects.toThrow(ForbiddenError);
    expect(await balance(laEsquina)).toBe("26000");
  });

  it("dos abonos a la vez que juntos superan el saldo: solo pasa uno", async () => {
    const results = await Promise.all([pay(ana, laEsquina, "20.000"), pay(ana, laEsquina, "20.000")]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await balance(laEsquina)).toBe("6000");
  });
});

describe("comprobante y correo del abono", () => {
  it("el comprobante lo imprime quien cobró (turno abierto) o quien revisa cierres", async () => {
    const first = (await db.customerPayment.findFirstOrThrow({ where: { companyId: a.id, number: 1 } })).id;
    const printable = await getPrintableCustomerPayment(ana, first);
    expect(printable?.payment).toMatchObject({
      number: 1,
      customerName: "Restaurante La Esquina",
      customerTaxId: "900111",
      amount: "40000",
      tendered: "50000",
      change: "10000",
      balanceAfter: "26000",
      cashSessionId: anaShift,
    });
    expect(await getPrintableCustomerPayment(owner, first)).not.toBeNull();
    expect(await getPrintableCustomerPayment(beto, first)).toBeNull();
    await expect(getPrintableCustomerPayment(staff, first)).rejects.toThrow(ForbiddenError);
  });

  it("el correo lleva el abono, el método y el saldo; no sale sin correo ni anulado", async () => {
    const sent = captureEmails();
    const withEmail = (await db.customerPayment.findFirstOrThrow({ where: { companyId: a.id, number: 1 } })).id;
    const noEmail = (await db.customerPayment.findFirstOrThrow({ where: { companyId: a.id, number: 2 } })).id;
    expect(await sendCustomerPaymentEmail(a.id, withEmail)).toBe("SENT");
    expect(await sendCustomerPaymentEmail(a.id, noEmail)).toBeNull();
    expect(await sendCustomerPaymentEmail(b.id, withEmail)).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("esquina@cliente.co");
    expect(sent[0].subject).toBe(`Abono recibido en Arepas Prueba · Abono #1 · ${$(40000)}`);
    expect(sent[0].text).toContain(`Tu saldo pendiente es de ${$(26000)}.`);
    expect(sent[0].text).toContain("Forma de pago: Efectivo");
  });

  it("el texto dice paz y salvo con saldo 0 y escapa los datos", () => {
    const email = buildCustomerPaymentEmail({
      companyName: "Café <b>",
      companyPhone: null,
      logoUrl: null,
      currency: "COP",
      dateFormat: "DD/MM/YYYY",
      timeZone: "America/Bogota",
      customerName: "Ana & Cía",
      payment: { number: 3, createdAt: new Date(), amount: "5000", methodName: "Nequi", balanceAfter: "0" },
    });
    expect(email.text).toContain("Con este abono quedas a paz y salvo.");
    expect(email.html).toContain("Ana &amp; Cía");
    expect(email.html).not.toContain("<b>");
  });
});

describe("abonos en el panel y en el cierre", () => {
  it("se anulan con motivo mientras el turno esté abierto: la deuda sube y sale del esperado", async () => {
    const first = (await db.customerPayment.findFirstOrThrow({ where: { companyId: a.id, number: 1 } })).id;
    expect(await voidCustomerPaymentFromPanel(owner, first, { reason: "x" })).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
    });
    expect(await voidCustomerPaymentFromPanel(owner, first, { reason: "Se registró dos veces" })).toEqual({ ok: true });
    expect(await voidCustomerPaymentFromPanel(owner, first, { reason: "Otra vez" })).toEqual({
      ok: false,
      error: "Este abono ya estaba anulado.",
      fieldErrors: {},
    });
    await expect(voidCustomerPaymentFromPanel(ana, first, { reason: "Error" })).rejects.toThrow(ForbiddenError);
    expect(await balance(laEsquina)).toBe("46000");
    // Queda el abono en efectivo de 20.000 del paso concurrente.
    expect((await expectedCash(db, a.id, anaShift)).toString()).toBe("120000");
    expect(await sendCustomerPaymentEmail(a.id, first)).toBeNull();

    const review = await getCashSessionReview(owner, anaShift);
    expect(review?.shift.cash.payments).toBe("20000");
    expect(review?.shift.paymentTotals).toEqual({ count: 2, total: "33000", cash: "20000" });
    expect(review?.shift.payments.find((p) => p.number === 1)?.voided?.reason).toBe("Se registró dos veces");
  });

  it("el cierre incluye los abonos en efectivo en el cuadre, la hoja y el reporte; cerrado ya no se anula", async () => {
    const lastId = (await db.customerPayment.findFirstOrThrow({ where: { companyId: a.id }, orderBy: { number: "desc" } })).id;
    expect((await closeShift(ana, { countedCash: "120.000", closingNote: "" })).ok).toBe(true);

    const closed = await getClosedShift(ana, anaShift);
    expect(closed?.shift.expectedCash).toBe("120000");
    expect(closed?.shift.cash).toEqual({ sales: "0", payments: "20000", deposits: "0", expenses: "0", withdrawals: "0" });

    const sheet = await getPrintableShift(ana, anaShift);
    expect(sheet?.shift.payments.map((p) => [p.customerName, p.methodName, p.amount])).toEqual([
      ["Don Pedro", "Tarjeta", "13000"],
      ["Restaurante La Esquina", "Efectivo", "20000"],
    ]);
    expect(sheet?.shift.voidedPaymentsCount).toBe(1);

    const period = await findClosingReportPeriod(a.id, {
      periodStart: new Date(Date.now() - 3_600_000),
      cutoff: new Date(),
    });
    expect(period.customerPayments.count).toBe(2);
    expect(period.customerPayments.total.toString()).toBe("33000");

    expect(await voidCustomerPaymentFromPanel(owner, lastId, { reason: "Tarde" })).toEqual({
      ok: false,
      error: "El turno de este abono ya se cerró: no se puede anular.",
      fieldErrors: {},
    });
    // Con el turno cerrado, quien cobró ya no reimprime el comprobante.
    expect(await getPrintableCustomerPayment(ana, lastId)).toBeNull();
  });
});
