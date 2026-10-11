import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/company-formats";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { openShift } from "@/server/services/cash-sessions";
import { buildCreditSaleEmail, sendCreditSaleEmail } from "@/server/services/credit-sale-email";
import { createCreditCustomer, getCustomer } from "@/server/services/customers";
import { setMessageSenderForTesting, type OutgoingEmail } from "@/server/services/messaging";
import {
  checkout,
  getPosCatalog,
  getPrintableSale,
  getSaleDetail,
  searchPosCustomers,
  voidSaleFromPanel,
} from "@/server/services/sales";

import { cleanupCompanies, createCompany, createMainBranch, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("credito");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let owner: StaffSessionDto;
let cashier: StaffSessionDto;
let staff: StaffSessionDto;
let cash: string;
let credit: string;
let arepa: string;
let ana: string;
let beto: string;
let sinCorreo: string;
let archivado: string;
let sinCupo: string;
let ajeno: string;

// Montos como los muestra la app (con espacio duro tras el signo).
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
    { name, taxId: "", phone: "", email: "", creditLimit: "0", creditDays: "30", ...extra },
    ctx(tag),
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.customerId;
}

// Venta de arepas (16.500 c/u) con los pagos indicados.
function sell(
  payments: { paymentMethodId: string; amount: string; tendered?: string }[],
  customerId: string | null,
  quantity = 1,
) {
  return checkout(cashier, {
    clientKey: randomUUID(),
    lines: [{ productId: arepa, quantity }],
    payments,
    customerId,
  });
}

async function balance(customerId: string) {
  return (await getCustomer(owner, customerId))!.customer.balance;
}

// Correos enviados mientras dura la prueba.
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
  await db.paymentMethod.updateMany({ where: { isCredit: true, companyId: { in: [a.id, b.id] } }, data: { isActive: true } });
  cash = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: a.id, isCash: true } })).id;
  credit = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: a.id, isCredit: true } })).id;

  await createProductCategory(a.id, "Arepas");
  const categoryId = (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id } })).id;
  const harina = (
    await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, idealStock: null, unitCost: null })
  ).id!;
  arepa = (await createProduct(a.id, { categoryId, name: "Arepa de queso", description: null, price: "16500" })).id!;
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });

  owner = sessionFor(a, (await createUser({ companyId: a.id, email: `dueno@${tag}.co`, role: "OWNER" })).id, "OWNER");
  cashier = sessionFor(a, (await createUser({ companyId: a.id, email: `caja@${tag}.co`, role: "CASHIER" })).id, "CASHIER");
  staff = sessionFor(a, (await createUser({ companyId: a.id, email: `personal@${tag}.co`, role: "STAFF" })).id, "STAFF");
  const ownerB = sessionFor(b, (await createUser({ companyId: b.id, email: `dueno-b@${tag}.co`, role: "OWNER" })).id, "OWNER");

  ana = await customer(owner, "Ana Restaurante", {
    taxId: "900123",
    email: "ana@cliente.co",
    creditLimit: "50.000",
    creditDays: "15",
  });
  beto = await customer(owner, "Beto Tienda", { creditLimit: "200.000", email: "beto@cliente.co" });
  sinCorreo = await customer(owner, "Carla Sin Correo", { creditLimit: "100.000" });
  archivado = await customer(owner, "Dora Archivada", { creditLimit: "100.000" });
  await db.thirdParty.update({ where: { id: archivado }, data: { isArchived: true } });
  sinCupo = await customer(owner, "Elena Sin Cupo");
  ajeno = await customer(ownerB, "Ana Otra Empresa", { creditLimit: "100.000" });

  expect((await openShift(cashier, { branchId: "", openingAmount: "0" })).ok).toBe(true);
});
afterEach(() => setMessageSenderForTesting(null));
afterAll(() => cleanupCompanies(tag));

describe("venta a crédito en el POS", () => {
  it("el POS ofrece Crédito y busca solo clientes activos con cupo, con su disponible", async () => {
    expect((await getPosCatalog(cashier)).paymentMethods.map((m) => [m.name, m.isCredit])).toContainEqual([
      "Crédito",
      true,
    ]);
    expect(await searchPosCustomers(cashier, "a")).toEqual([]);
    expect((await searchPosCustomers(cashier, " an ")).map((c) => c.name)).toEqual(["Ana Restaurante"]);
    expect(await searchPosCustomers(cashier, "900123")).toEqual([
      { id: ana, name: "Ana Restaurante", taxId: "900123", available: "50000" },
    ]);
    // Ni archivados, ni sin cupo, ni de otra empresa.
    expect(await searchPosCustomers(cashier, "Dora")).toEqual([]);
    expect(await searchPosCustomers(cashier, "Elena")).toEqual([]);
    expect((await searchPosCustomers(cashier, "Ana")).map((c) => c.id)).toEqual([ana]);
    await expect(searchPosCustomers(staff, "Ana")).rejects.toThrow(ForbiddenError);
  });

  it("vende a crédito dentro del cupo y el cliente queda en la venta, el detalle y el soporte", async () => {
    const result = await sell([{ paymentMethodId: credit, amount: "33000" }], ana, 2);
    expect(result).toMatchObject({ ok: true, total: "33000", change: "0", onCredit: true, alreadyRecorded: false });
    if (!result.ok) throw new Error();
    expect(await balance(ana)).toBe("33000");
    expect((await searchPosCustomers(cashier, "Ana"))[0].available).toBe("17000");

    const detail = await getSaleDetail(owner, result.saleId);
    expect(detail?.sale.customer).toEqual({ id: ana, name: "Ana Restaurante", taxId: "900123" });
    expect((await getPrintableSale(cashier, result.saleId))?.sale.customer).toEqual({
      id: ana,
      name: "Ana Restaurante",
      taxId: "900123",
    });
  });

  it("no deja pasar del disponible; con pago mixto el resto se cobra con otro método", async () => {
    // Ana tiene 17.000 disponibles.
    expect(await sell([{ paymentMethodId: credit, amount: "33000" }], ana, 2)).toEqual({
      ok: false,
      error: `Supera el cupo disponible de Ana Restaurante (${$(17000)}).`,
      refresh: false,
    });
    const mixed = await sell(
      [
        { paymentMethodId: credit, amount: "17000" },
        { paymentMethodId: cash, amount: "16000", tendered: "20000" },
      ],
      ana,
      2,
    );
    expect(mixed).toMatchObject({ ok: true, change: "4000", onCredit: true });
    expect(await balance(ana)).toBe("50000");
  });

  it("crédito exige cliente, el cliente exige crédito, y no sirven archivados, sin cupo ni de otra empresa", async () => {
    const onCredit = [{ paymentMethodId: credit, amount: "16500" }];
    expect(await sell(onCredit, null)).toMatchObject({
      ok: false,
      error: "Para vender a crédito hay que elegir el cliente.",
    });
    expect(await sell([{ paymentMethodId: cash, amount: "16500" }], beto)).toMatchObject({
      ok: false,
      error: "El cliente solo se asigna a la parte pagada a crédito.",
    });
    for (const customerId of [archivado, ajeno, "no-existe"]) {
      expect(await sell(onCredit, customerId)).toMatchObject({
        ok: false,
        error: "Ese cliente ya no está disponible para crédito. Elige otro.",
      });
    }
    expect(await sell(onCredit, sinCupo)).toMatchObject({
      ok: false,
      error: `Supera el cupo disponible de Elena Sin Cupo (${$(0)}).`,
    });
    // Ninguno de los rechazos dejó deuda ni venta con cliente.
    expect(await db.sale.count({ where: { companyId: a.id, customerId: { in: [beto, archivado, sinCupo] } } })).toBe(0);
  });

  it("dos ventas a la vez que juntas superan el cupo: solo pasa una", async () => {
    // Beto: cupo 200.000. Cada venta es de 115.500 (7 arepas).
    const results = await Promise.all([
      sell([{ paymentMethodId: credit, amount: "115500" }], beto, 7),
      sell([{ paymentMethodId: credit, amount: "115500" }], beto, 7),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: `Supera el cupo disponible de Beto Tienda (${$(84500)}).`,
    });
    expect(await balance(beto)).toBe("115500");
  });
});

describe("correo de la compra a crédito", () => {
  it("le llega al cliente con el pedido, lo cargado, el número y la fecha límite", async () => {
    const sale = await sell(
      [
        { paymentMethodId: credit, amount: "20000" },
        { paymentMethodId: cash, amount: "13000" },
      ],
      beto,
      2,
    );
    if (!sale.ok) throw new Error(sale.error);
    const sent = captureEmails();
    expect(await sendCreditSaleEmail(a.id, sale.saleId)).toBe("SENT");
    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.to).toBe("beto@cliente.co");
    expect(email.subject).toBe(`Compra a crédito en Arepas Prueba · Venta #${sale.number} · ${$(20000)}`);
    expect(email.text).toContain(`2 × Arepa de queso: ${$(33000)}`);
    expect(email.text).toContain(`Cargado a tu cuenta: ${$(20000)}`);
    expect(email.text).toContain(`Pagado con Efectivo: ${$(13000)}`);
    expect(email.text).toContain("Fecha límite de pago:");
    expect(email.html).toContain(`Venta #${sale.number}`);
  });

  it("no sale sin correo, en una venta sin crédito ni en una anulada; un fallo no lanza", async () => {
    const sent = captureEmails();
    const noEmail = await sell([{ paymentMethodId: credit, amount: "16500" }], sinCorreo);
    const noCredit = await sell([{ paymentMethodId: cash, amount: "16500" }], null);
    if (!noEmail.ok || !noCredit.ok) throw new Error();
    expect(noCredit.onCredit).toBe(false);
    expect(await sendCreditSaleEmail(a.id, noEmail.saleId)).toBeNull();
    expect(await sendCreditSaleEmail(a.id, noCredit.saleId)).toBeNull();
    expect(await sendCreditSaleEmail(b.id, noEmail.saleId)).toBeNull();

    const voided = await sell([{ paymentMethodId: credit, amount: "16500" }], beto);
    if (!voided.ok) throw new Error();
    expect(await voidSaleFromPanel(owner, voided.saleId, { reason: "Error de prueba" })).toEqual({ ok: true });
    expect(await sendCreditSaleEmail(a.id, voided.saleId)).toBeNull();
    expect(sent).toHaveLength(0);

    const failing = await sell([{ paymentMethodId: credit, amount: "16500" }], beto);
    if (!failing.ok) throw new Error(failing.error);
    setMessageSenderForTesting({
      async sendEmail() {
        throw new Error("Proveedor caído");
      },
    });
    expect(await sendCreditSaleEmail(a.id, failing.saleId)).toBe("FAILED");
  });

  it("el texto escapa los datos y calcula la fecha límite con el plazo en la zona de la empresa", () => {
    const email = buildCreditSaleEmail({
      companyName: "Café <b>",
      companyPhone: "300 123",
      logoUrl: null,
      currency: "COP",
      dateFormat: "DD/MM/YYYY",
      timeZone: "America/Bogota",
      customerName: "Ana & Cía",
      creditDays: 15,
      sale: {
        number: 7,
        // 23:30 del 30/09 en Bogotá (04:30 UTC del 01/10).
        createdAt: new Date("2026-10-01T04:30:00Z"),
        total: "16500",
        lines: [{ productName: "Arepa <script>", quantity: 1, lineTotal: "16500" }],
        payments: [{ methodName: "Crédito", amount: "16500", isCredit: true }],
      },
    });
    expect(email.text).toContain("Fecha límite de pago: 15/10/2026");
    expect(email.text).toContain("comunícate con Café <b> al 300 123");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Arepa &lt;script&gt;");
    expect(email.html).toContain("Ana &amp; Cía");
  });
});

describe("anular una venta a crédito", () => {
  it("baja la deuda; si los abonos ya la cubrieron, pide anular primero el abono", async () => {
    const fabio = await customer(owner, "Fabio Abonos", { creditLimit: "100.000" });
    const sale = await sell([{ paymentMethodId: credit, amount: "33000" }], fabio, 2);
    const other = await sell([{ paymentMethodId: credit, amount: "16500" }], fabio);
    if (!sale.ok || !other.ok) throw new Error();
    expect(await balance(fabio)).toBe("49500");

    // Abona 40.000: debe 9.500. Anular la de 33.000 dejaría −23.500.
    const shift = await db.cashSession.findFirstOrThrow({ where: { companyId: a.id, userId: cashier.user.id, closedAt: null } });
    const payment = await db.customerPayment.create({
      data: {
        companyId: a.id,
        number: 1,
        customerId: fabio,
        cashSessionId: shift.id,
        paymentMethodId: cash,
        amount: "40000",
        userId: cashier.user.id,
      },
    });
    expect(await voidSaleFromPanel(owner, sale.saleId, { reason: "Se equivocó" })).toEqual({
      ok: false,
      error: "El cliente ya abonó esta venta a crédito. Primero anula el abono de este cliente.",
      fieldErrors: {},
    });
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.saleId } })).status).toBe("COMPLETED");

    // La de 16.500 tampoco: 9.500 − 16.500 < 0.
    expect(await voidSaleFromPanel(owner, other.saleId, { reason: "Se equivocó" })).toMatchObject({ ok: false });

    // Anulado el abono, la venta se anula y la deuda baja.
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidedById: owner.user.id, voidReason: "Prueba" },
    });
    expect(await voidSaleFromPanel(owner, sale.saleId, { reason: "Se equivocó" })).toEqual({ ok: true });
    expect(await balance(fabio)).toBe("16500");
  });
});
