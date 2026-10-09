import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("cartera-db");
let companyId: string;
let customerId: string;
let cashSessionId: string;
let cash: string;
let userId: string;

beforeAll(async () => {
  companyId = (await createCompany(`${tag}-a`)).id;
  const { branchId } = await createMainBranch(companyId);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, companyId));
  cash = (await db.paymentMethod.findFirstOrThrow({ where: { companyId, isCash: true } })).id;
  userId = (await createUser({ companyId, email: `caja@${tag}.co`, role: "CASHIER" })).id;
  cashSessionId = (
    await db.cashSession.create({ data: { companyId, branchId, userId, openingAmount: "0" } })
  ).id;
  customerId = (
    await db.thirdParty.create({ data: { companyId, name: "Cliente", isCustomer: true, creditLimit: "100000" } })
  ).id;
});
afterAll(() => cleanupCompanies(tag));

const payment = (data: Record<string, unknown> = {}) =>
  db.customerPayment.create({
    data: { companyId, number: 1, customerId, cashSessionId, paymentMethodId: cash, amount: "10000", userId, ...data },
  });

describe("reglas de la base para la cartera", () => {
  it("el cliente nace con cupo 0 y plazo de 30 días; el cupo no es negativo y el plazo va de 0 a 365", async () => {
    const plain = await db.thirdParty.create({ data: { companyId, name: "Sin crédito", isCustomer: true } });
    expect(plain.creditLimit.toString()).toBe("0");
    expect(plain.creditDays).toBe(30);
    await expect(db.thirdParty.update({ where: { id: plain.id }, data: { creditLimit: "-1" } })).rejects.toThrow();
    await expect(db.thirdParty.update({ where: { id: plain.id }, data: { creditDays: 366 } })).rejects.toThrow();
    await expect(db.thirdParty.update({ where: { id: plain.id }, data: { creditDays: -1 } })).rejects.toThrow();
  });

  it("un abono: monto positivo, recibido no menor, número único y anulación completa", async () => {
    await expect(payment({ amount: "0" })).rejects.toThrow();
    await expect(payment({ tendered: "5000" })).rejects.toThrow();
    await expect(payment({ status: "VOIDED" })).rejects.toThrow();
    await expect(payment({ voidReason: "Error" })).rejects.toThrow();
    await expect(payment({ note: "x".repeat(201) })).rejects.toThrow();

    const ok = await payment({ tendered: "20000" });
    expect(ok.status).toBe("RECORDED");
    await expect(payment()).rejects.toThrow();
    const voided = await db.customerPayment.update({
      where: { id: ok.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidedById: userId, voidReason: "Error de digitación" },
    });
    expect(voided.status).toBe("VOIDED");
  });

  it("un abono solo apunta a un cliente de su empresa", async () => {
    const other = (await createCompany(`${tag}-b`)).id;
    const foreign = await db.thirdParty.create({ data: { companyId: other, name: "Ajeno", isCustomer: true } });
    await expect(
      db.customerPayment.create({
        data: { companyId, number: 9, customerId: foreign.id, cashSessionId, paymentMethodId: cash, amount: "1", userId },
      }),
    ).rejects.toThrow();
  });
});
