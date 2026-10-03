import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply, recordStockMovement } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { closeShift, openShift } from "@/server/services/cash-sessions";
import { checkout, getPrintableSale, voidSaleFromPanel } from "@/server/services/sales";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("printing");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let ana: StaffSessionDto;
let beto: StaffSessionDto;
let admin: StaffSessionDto;
let staff: StaffSessionDto;
let otherAdmin: StaffSessionDto;
let saleId: string;

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function member(company: Company, role: StaffRole, name: string) {
  const user = await createUser({
    companyId: company.id,
    email: `${name.toLowerCase()}-${company.slug}@${tag}.co`,
    role,
    name,
  });
  return sessionFor(company, user.id, role);
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Su Arepa");
  b = await createCompany(`${tag}-b`);
  await db.company.update({
    where: { id: a.id },
    data: { taxId: "900.000.000-0", address: "Calle 10 # 20-30", phone: "300 000 0000" },
  });
  const { warehouseId } = await createMainBranch(a.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  const methods = await db.paymentMethod.findMany({ where: { companyId: a.id } });
  const cash = methods.find((m) => m.isCash)!.id;
  const card = methods.find((m) => m.name === "Tarjeta")!.id;

  ana = await member(a, "CASHIER", "Ana");
  beto = await member(a, "CASHIER", "Beto");
  admin = await member(a, "ADMIN", "Carla");
  staff = await member(a, "STAFF", "Dani");
  otherAdmin = await member(b, "ADMIN", "Eva");

  await createProductCategory(a.id, "Arepas");
  const categoryId = (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id } })).id;
  const harina = (
    await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, unitCost: null })
  ).id!;
  await recordStockMovement(a.id, {
    warehouseId,
    supplyId: harina,
    type: "INITIAL",
    quantity: "10",
    reason: null,
    userId: admin.user.id,
  });
  const product = async (name: string, price: string) => {
    const id = (await createProduct(a.id, { categoryId, name, description: null, price })).id!;
    await addRecipeItem(a.id, id, harina, { quantity: "120", unit: "G" });
    return id;
  };
  const queso = await product("Arepa de queso", "16500");
  const mixta = await product("Arepa mixta", "20000");

  await openShift(ana, { branchId: "", openingAmount: "0" });
  await openShift(beto, { branchId: "", openingAmount: "0" });
  const result = await checkout(ana, {
    clientKey: randomUUID(),
    lines: [
      { productId: queso, quantity: 2, note: "Una sin sal" },
      { productId: mixta, quantity: 1 },
    ],
    payments: [
      { paymentMethodId: card, amount: "23000" },
      { paymentMethodId: cash, amount: "30000", tendered: "50000" },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  saleId = result.saleId;
});
afterAll(() => cleanupCompanies(tag));

describe("hoja imprimible de una venta", () => {
  it("trae el encabezado de la empresa y el contenido de la venta", async () => {
    const printable = await getPrintableSale(admin, saleId);
    expect(printable?.company).toEqual({
      name: "Su Arepa",
      taxId: "900.000.000-0",
      address: "Calle 10 # 20-30",
      phone: "300 000 0000",
      logoUrl: null,
    });
    expect(printable?.sale).toMatchObject({
      id: saleId,
      number: 1,
      total: "53000",
      change: "20000",
      cashierName: "Ana",
      branchName: "Sede principal",
      voided: false,
      itemCount: 3,
    });
    expect(
      printable?.sale.lines.map((l) => [l.quantity, l.productName, l.unitPrice, l.lineTotal, l.note]),
    ).toEqual([
      [2, "Arepa de queso", "16500", "33000", "Una sin sal"],
      [1, "Arepa mixta", "20000", "20000", null],
    ]);
    expect(printable?.sale.payments.map((p) => [p.methodName, p.amount, p.tendered])).toEqual([
      ["Efectivo", "30000", "50000"],
      ["Tarjeta", "23000", null],
    ]);
  });

  it("el cajero imprime las ventas de su turno abierto, no las de otro", async () => {
    expect((await getPrintableSale(ana, saleId))?.sale.id).toBe(saleId);
    expect(await getPrintableSale(beto, saleId)).toBeNull();
  });

  it("no cruza empresas ni deja imprimir a quien no cobra", async () => {
    expect(await getPrintableSale(otherAdmin, saleId)).toBeNull();
    expect(await getPrintableSale(admin, "no-existe")).toBeNull();
    await expect(getPrintableSale(staff, saleId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("una venta anulada sale marcada", async () => {
    expect((await voidSaleFromPanel(admin, saleId, { reason: "Prueba de impresión" })).ok).toBe(
      true,
    );
    expect((await getPrintableSale(admin, saleId))?.sale.voided).toBe(true);
    expect((await getPrintableSale(ana, saleId))?.sale.voided).toBe(true);
  });

  it("con el turno cerrado el cajero ya no la imprime; el administrador sí", async () => {
    expect((await closeShift(ana, { countedCash: "0", closingNote: "" })).ok).toBe(true);
    expect(await getPrintableSale(ana, saleId)).toBeNull();
    expect((await getPrintableSale(admin, saleId))?.sale.id).toBe(saleId);
  });
});
