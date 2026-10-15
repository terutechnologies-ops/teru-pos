import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { addCalendarDays, calendarDay } from "@/lib/company-formats";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { getPendingAlerts } from "@/server/services/alerts";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { openShift } from "@/server/services/cash-sessions";
import {
  registerCustomerPayment,
  voidCustomerPaymentFromPanel,
} from "@/server/services/customer-payments";
import {
  countOverdueCustomers,
  createCreditCustomer,
  getCustomerList,
  getCustomerStatement,
} from "@/server/services/customers";
import { checkout, voidSaleFromPanel } from "@/server/services/sales";

import { cleanupCompanies, createCompany, createMainBranch, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("cartera");
const BOGOTA = "America/Bogota";
const DAY_MS = 86_400_000;
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let owner: StaffSessionDto;
let ana: StaffSessionDto;
let ownerB: StaffSessionDto;
let laEsquina: string;
let donPedro: string;
let sinDeuda: string;
let ajeno: string;
// Ventas de La Esquina, de la más vieja a la más nueva.
let sales: string[] = [];
let voidedSale: string;
let voidedPayment: string;

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function customer(session: StaffSessionDto, name: string) {
  const result = await createCreditCustomer(
    session,
    { name, taxId: "", phone: "", email: "", creditLimit: "500.000", creditDays: "30" },
    ctx(tag),
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.customerId;
}

// Prepara una empresa con Crédito activo, una arepa de 16.500 con receta y un
// turno abierto de quien cobra.
async function setupCompany(company: Company, cashier: StaffSessionDto) {
  await createMainBranch(company.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, company.id));
  await db.paymentMethod.updateMany({ where: { companyId: company.id, isCredit: true }, data: { isActive: true } });
  await createProductCategory(company.id, "Arepas");
  const categoryId = (await db.productCategory.findFirstOrThrow({ where: { companyId: company.id } })).id;
  const harina = (
    await createSupply(company.id, { name: "Harina", unit: "KG", minStock: null, idealStock: null, unitCost: null })
  ).id!;
  const arepa = (
    await createProduct(company.id, { categoryId, name: "Arepa", description: null, price: "16500" })
  ).id!;
  await addRecipeItem(company.id, arepa, harina, { quantity: "120", unit: "G" });
  const opened = await openShift(cashier, { branchId: "", openingAmount: "100.000" });
  if (!opened.ok) throw new Error(opened.error);
  const credit = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: company.id, isCredit: true } })).id;
  return { arepa, credit };
}

// Venta a crédito hecha hace `daysAgo` días.
async function owe(
  session: StaffSessionDto,
  setup: { arepa: string; credit: string },
  customerId: string,
  quantity: number,
  daysAgo: number,
) {
  const result = await checkout(session, {
    clientKey: randomUUID(),
    lines: [{ productId: setup.arepa, quantity }],
    payments: [{ paymentMethodId: setup.credit, amount: String(16500 * quantity) }],
    customerId,
  });
  if (!result.ok) throw new Error(result.error);
  if (daysAgo > 0) {
    await db.sale.update({
      where: { id: result.saleId },
      data: { createdAt: new Date(Date.now() - daysAgo * DAY_MS) },
    });
  }
  return result.saleId;
}

async function pay(session: StaffSessionDto, customerId: string, amount: string) {
  const cash = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: session.company.id, isCash: true } })).id;
  const result = await registerCustomerPayment(session, {
    customerId,
    paymentMethodId: cash,
    amount,
    tendered: "",
    note: "",
  });
  if (!result.ok) throw new Error(result.error);
  return result.paymentId;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Arepas Prueba");
  b = await createCompany(`${tag}-b`);
  const user = (company: Company, email: string, role: StaffRole) =>
    createUser({ companyId: company.id, email: `${email}@${tag}.co`, role });
  owner = sessionFor(a, (await user(a, "dueno", "OWNER")).id, "OWNER");
  ana = sessionFor(a, (await user(a, "ana", "CASHIER")).id, "CASHIER");
  ownerB = sessionFor(b, (await user(b, "dueno-b", "OWNER")).id, "OWNER");

  const setupA = await setupCompany(a, ana);
  const setupB = await setupCompany(b, ownerB);
  laEsquina = await customer(owner, "Restaurante La Esquina");
  donPedro = await customer(owner, "Don Pedro");
  sinDeuda = await customer(owner, "Sin Deuda");
  ajeno = await customer(ownerB, "Cliente Ajeno");

  // La Esquina: 33.000 hace 40 días, 16.500 hace 35, 16.500 hoy; una venta
  // anulada; abona 20.000 y otro abono anulado.
  sales = [
    await owe(ana, setupA, laEsquina, 2, 40),
    await owe(ana, setupA, laEsquina, 1, 35),
    await owe(ana, setupA, laEsquina, 1, 0),
  ];
  voidedSale = await owe(ana, setupA, laEsquina, 1, 0);
  const voided = await voidSaleFromPanel(owner, voidedSale, { reason: "Se cobró dos veces" });
  if (!voided.ok) throw new Error(JSON.stringify(voided));
  await pay(ana, laEsquina, "20.000");
  voidedPayment = await pay(ana, laEsquina, "5.000");
  const voidedResult = await voidCustomerPaymentFromPanel(owner, voidedPayment, { reason: "Era de otro cliente" });
  if (!voidedResult.ok) throw new Error(JSON.stringify(voidedResult));

  // Don Pedro: una venta de hace exactamente 30 días (vence hoy, no está vencida).
  await owe(ana, setupA, donPedro, 1, 30);
  // Otra empresa, con algo vencido que no debe contarse en A.
  await owe(ownerB, setupB, ajeno, 1, 60);
});
afterAll(() => cleanupCompanies(tag));

describe("cartera y estado de cuenta", () => {
  it("la cartera suma lo que deben y lo vencido; 'Deben' ordena por vencido", async () => {
    const owing = await getCustomerList(owner, { owing: true });
    expect(owing.customers.map((c) => [c.name, c.balance, c.overdue])).toEqual([
      ["Restaurante La Esquina", "46000", "29500"],
      ["Don Pedro", "16500", "0"],
    ]);
    expect(owing.summary).toEqual({
      receivable: "62500",
      overdue: "29500",
      owingCustomers: 2,
      overdueCustomers: 1,
    });

    const all = await getCustomerList(owner, {});
    expect(all.customers.map((c) => [c.name, c.overdue])).toEqual([
      ["Don Pedro", "0"],
      ["Restaurante La Esquina", "29500"],
      ["Sin Deuda", "0"],
    ]);
    // La búsqueda también filtra la pestaña "Deben"; el resumen no cambia.
    const searched = await getCustomerList(owner, { owing: true, search: "pedro" });
    expect(searched.customers.map((c) => c.name)).toEqual(["Don Pedro"]);
    expect(searched.summary.receivable).toBe("62500");
  });

  it("el estado de cuenta muestra cada movimiento con su saldo y la fecha límite de lo pendiente", async () => {
    const statement = (await getCustomerStatement(owner, laEsquina))!;
    expect(statement.customer).toMatchObject({ balance: "46000", overdue: "29500", available: "454000" });
    const today = calendarDay(new Date(), BOGOTA);
    expect(statement.today).toBe(today);

    // Del más reciente al más antiguo.
    expect(statement.movements.map((m) => [m.kind, m.amount, m.voided, m.balance])).toEqual([
      ["PAYMENT", "5000", true, null],
      ["PAYMENT", "20000", false, "46000"],
      ["SALE", "16500", true, null],
      ["SALE", "16500", false, "66000"],
      ["SALE", "16500", false, "49500"],
      ["SALE", "33000", false, "33000"],
    ]);
    const due = (saleId: string) => statement.movements.find((m) => m.id === saleId)!.due;
    const day = (daysAgo: number) => addCalendarDays(calendarDay(new Date(Date.now() - daysAgo * DAY_MS), BOGOTA), 30);
    // El abono de 20.000 cubre parte de la venta más vieja.
    expect(due(sales[0])).toEqual({ day: day(40), pending: "13000", daysOverdue: 10 });
    expect(due(sales[1])).toEqual({ day: day(35), pending: "16500", daysOverdue: 5 });
    expect(due(sales[2])).toEqual({ day: day(0), pending: "16500", daysOverdue: 0 });
    expect(due(voidedSale)).toBeNull();
    const payment = statement.movements.find((m) => m.id === voidedPayment)!;
    expect(payment).toMatchObject({ kind: "PAYMENT", methodName: "Efectivo", due: null });
    expect(statement).toMatchObject({ canViewSales: true, canViewShifts: true });

    // El día de la fecha límite todavía no está vencida.
    const pedro = (await getCustomerStatement(owner, donPedro))!;
    expect(pedro.movements[0].due).toEqual({ day: today, pending: "16500", daysOverdue: 0 });
    expect(pedro.customer.overdue).toBe("0");

    const empty = (await getCustomerStatement(owner, sinDeuda))!;
    expect(empty.movements).toEqual([]);
    expect(empty.customer.balance).toBe("0");
  });

  it("la alerta cuenta los clientes con algo vencido, sin otras empresas", async () => {
    expect((await getPendingAlerts(owner)).overdueCustomers).toBe(1);
    expect(await countOverdueCustomers(ownerB)).toBe(1);
    expect((await getPendingAlerts(ana)).overdueCustomers).toBeNull();
  });

  it("la fecha límite usa el plazo actual del cliente", async () => {
    await db.thirdParty.update({ where: { id: laEsquina }, data: { creditDays: 60 } });
    try {
      expect((await getCustomerStatement(owner, laEsquina))!.customer.overdue).toBe("0");
      expect(await countOverdueCustomers(owner)).toBe(0);
    } finally {
      await db.thirdParty.update({ where: { id: laEsquina }, data: { creditDays: 30 } });
    }
  });

  it("no muestra clientes de otra empresa ni deja entrar sin permiso", async () => {
    expect(await getCustomerStatement(owner, ajeno)).toBeNull();
    expect(await getCustomerStatement(owner, "no-existe")).toBeNull();
    expect((await getCustomerList(ownerB, { owing: true })).customers.map((c) => c.name)).toEqual(["Cliente Ajeno"]);
    await expect(getCustomerStatement(ana, laEsquina)).rejects.toThrow(ForbiddenError);
    await expect(countOverdueCustomers(ana)).rejects.toThrow(ForbiddenError);
  });
});
