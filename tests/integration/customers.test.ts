import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createCreditCustomer,
  getCustomer,
  getCustomerList,
  setCreditCustomerArchived,
  updateCreditCustomer,
} from "@/server/services/customers";
import { createThirdPartySupplier } from "@/server/services/third-parties";

import { cleanupCompanies, createCompany, createMainBranch, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("clientes");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let owner: StaffSessionDto;
let cashSessionId: string;
let branchId: string;
let creditMethod: string;
let cashMethod: string;
let saleNumber = 0;

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

const input = (name: string, extra: Partial<Record<string, string>> = {}) => ({
  name,
  taxId: "",
  phone: "",
  email: "",
  creditLimit: "0",
  creditDays: "30",
  ...extra,
});

async function newCustomer(name: string, extra: Partial<Record<string, string>> = {}) {
  const result = await createCreditCustomer(owner, input(name, extra), ctx(tag));
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.customerId;
}

// Venta a crédito directa en la base (la del POS llega con la venta a
// crédito): `credit` con el método Crédito y el resto en efectivo.
async function creditSale(customerId: string, credit: string, cash = "0", voided = false) {
  saleNumber += 1;
  const total = String(Number(credit) + Number(cash));
  const sale = await db.sale.create({
    data: {
      companyId: a.id,
      number: saleNumber,
      branchId,
      cashSessionId,
      userId: owner.user.id,
      total,
      customerId,
      ...(voided && {
        status: "VOIDED" as const,
        voidedAt: new Date(),
        voidedById: owner.user.id,
        voidReason: "Prueba",
      }),
    },
  });
  await db.salePayment.createMany({
    data: [
      { companyId: a.id, saleId: sale.id, paymentMethodId: creditMethod, amount: credit },
      ...(cash !== "0" ? [{ companyId: a.id, saleId: sale.id, paymentMethodId: cashMethod, amount: cash }] : []),
    ],
  });
}

let paymentNumber = 0;
async function abono(customerId: string, amount: string, voided = false) {
  paymentNumber += 1;
  await db.customerPayment.create({
    data: {
      companyId: a.id,
      number: paymentNumber,
      customerId,
      cashSessionId,
      paymentMethodId: cashMethod,
      amount,
      userId: owner.user.id,
      ...(voided && { status: "VOIDED" as const, voidedAt: new Date(), voidedById: owner.user.id, voidReason: "Prueba" }),
    },
  });
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  branchId = (await createMainBranch(a.id)).branchId;
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  creditMethod = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: a.id, isCredit: true } })).id;
  cashMethod = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: a.id, isCash: true } })).id;
  const user = await createUser({ companyId: a.id, email: `dueno@${tag}.co`, role: "OWNER" });
  owner = sessionFor(a, user.id, "OWNER");
  cashSessionId = (
    await db.cashSession.create({ data: { companyId: a.id, branchId, userId: user.id, openingAmount: "0" } })
  ).id;
});
afterAll(() => cleanupCompanies(tag));

describe("clientes de crédito", () => {
  it("valida los campos con mensajes por campo", async () => {
    const result = await createCreditCustomer(
      owner,
      input("X", { email: "malo", creditLimit: "", creditDays: "400" }),
      ctx(tag),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: "Escribe el nombre (mínimo 2 caracteres).",
        email: "Escribe un correo válido.",
        creditLimit: "Escribe el cupo.",
        creditDays: "Escribe el plazo en días (de 0 a 365).",
      },
    });
  });

  it("crea con el cupo en miles, audita solo si tiene crédito y no repite nombre con un proveedor", async () => {
    const id = await newCustomer("Restaurante La Esquina", {
      email: "COMPRAS@Esquina.co",
      creditLimit: "1.500.000",
      creditDays: "15",
    });
    const found = await getCustomer(owner, id);
    expect(found?.customer).toMatchObject({
      email: "compras@esquina.co",
      creditLimit: "1500000",
      creditDays: 15,
      balance: "0",
      available: "1500000",
    });
    const audit = (customerId: string) =>
      db.authAuditLog.count({ where: { targetType: "THIRD_PARTY", targetId: customerId, action: "CUSTOMER_CREDIT_CHANGED" } });
    expect(await audit(id)).toBe(1);
    expect(await audit(await newCustomer("Sin Crédito"))).toBe(0);

    await createThirdPartySupplier(owner, { name: "Distribuidora", taxId: "900", phone: "", email: "" });
    expect(await createCreditCustomer(owner, input("distribuidora"), ctx(tag))).toEqual({
      ok: false,
      fieldErrors: { name: "Ya existe un proveedor o cliente con ese nombre." },
    });
    expect(await createCreditCustomer(owner, input("Otro", { taxId: "900" }), ctx(tag))).toEqual({
      ok: false,
      fieldErrors: { taxId: "Ya existe un proveedor o cliente con ese NIT." },
    });
  });

  it("editar audita solo si cambian el cupo o el plazo", async () => {
    const id = await newCustomer("Cafetería Sol", { creditLimit: "100000" });
    const count = () =>
      db.authAuditLog.count({ where: { targetId: id, action: "CUSTOMER_CREDIT_CHANGED" } });
    expect(await count()).toBe(1);
    expect(await updateCreditCustomer(owner, id, input("Cafetería del Sol", { creditLimit: "100.000" }), ctx(tag))).toEqual({
      ok: true,
      customerId: id,
    });
    expect(await count()).toBe(1);
    await updateCreditCustomer(owner, id, input("Cafetería del Sol", { creditLimit: "100000", creditDays: "45" }), ctx(tag));
    expect(await count()).toBe(2);
  });

  it("el saldo es lo vendido a crédito menos los abonos, sin anuladas; el disponible nunca es negativo", async () => {
    const id = await newCustomer("Panadería Luna", { creditLimit: "50000" });
    await creditSale(id, "30000", "10000"); // solo cuentan los 30.000 a crédito
    await creditSale(id, "25000");
    await creditSale(id, "99000", "0", true); // anulada
    await abono(id, "5000");
    await abono(id, "7000", true); // anulado

    expect((await getCustomer(owner, id))?.customer).toMatchObject({ balance: "50000", available: "0" });
    await creditSale(id, "8000");
    const { customers } = await getCustomerList(owner, { search: "luna" });
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ balance: "58000", available: "0" });
  });

  it("no se archiva con saldo pendiente; en cero sí, y se restaura", async () => {
    const debtor = await newCustomer("Debe Plata", { creditLimit: "10000" });
    await creditSale(debtor, "4000");
    expect(await setCreditCustomerArchived(owner, debtor, true)).toEqual({
      ok: false,
      error: "Este cliente tiene saldo pendiente: no se puede archivar hasta que pague.",
    });
    await abono(debtor, "4000");
    expect(await setCreditCustomerArchived(owner, debtor, true)).toEqual({ ok: true });
    expect((await getCustomerList(owner, { search: "debe" })).customers).toHaveLength(0);
    expect((await getCustomerList(owner, { archived: true, search: "debe" })).customers).toHaveLength(1);
    expect(await setCreditCustomerArchived(owner, debtor, false)).toEqual({ ok: true });
  });

  it("no toca clientes de otra empresa ni proveedores, y solo OWNER y ADMIN gestionan", async () => {
    const id = await newCustomer("Cliente A");
    const otherUser = await createUser({ companyId: b.id, email: `b@${tag}.co`, role: "OWNER" });
    const ownerB = sessionFor(b, otherUser.id, "OWNER");
    expect(await getCustomer(ownerB, id)).toBeNull();
    expect(await updateCreditCustomer(ownerB, id, input("Robado"), ctx(tag))).toEqual({
      ok: false,
      fieldErrors: {},
      error: "El cliente ya no existe. Actualiza la página.",
    });
    expect(await setCreditCustomerArchived(ownerB, id, true)).toMatchObject({ ok: false });

    const supplier = await db.thirdParty.findFirstOrThrow({ where: { companyId: a.id, isSupplier: true } });
    expect(await getCustomer(owner, supplier.id)).toBeNull();

    const admin = sessionFor(a, owner.user.id, "ADMIN");
    expect((await getCustomerList(admin, {})).customers.length).toBeGreaterThan(0);
    for (const role of ["CASHIER", "STAFF"] as const) {
      const session = sessionFor(a, owner.user.id, role);
      await expect(getCustomerList(session, {})).rejects.toThrow(ForbiddenError);
      await expect(createCreditCustomer(session, input("Nuevo"), ctx(tag))).rejects.toThrow(ForbiddenError);
    }
  });
});
