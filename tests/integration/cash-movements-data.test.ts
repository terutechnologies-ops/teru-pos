import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createDefaultExpenseCategories,
  DEFAULT_EXPENSE_CATEGORIES,
  listSessionCashMovements,
  recordCashMovement,
  voidCashMovement,
} from "@/server/data/cash-movements";
import { closeCashSession, expectedCash, openCashSession } from "@/server/data/cash-sessions";
import { createCompanyWithOwnerInvitation } from "@/server/data/companies";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("cashmoves");
let companyId: string;
let otherCompanyId: string;
let branchId: string;
let ana: string;
let beto: string;
let admin: string;
let gas: string;
let otherCategory: string;

async function open(userId: string, openingAmount = "100000") {
  const result = await openCashSession(companyId, { userId, branchId, openingAmount });
  if (result.status !== "OK") throw new Error(result.status);
  return result.cashSessionId;
}

type MovementInput = Parameters<typeof recordCashMovement>[1];

function move(cashSessionId: string, input: Partial<MovementInput> = {}) {
  return recordCashMovement(companyId, {
    cashSessionId,
    userId: ana,
    type: "EXPENSE",
    amount: "5000",
    categoryId: gas,
    note: null,
    ...input,
  });
}

async function recorded(cashSessionId: string, input: Partial<MovementInput> = {}) {
  const result = await move(cashSessionId, input);
  if (result.status !== "OK") throw new Error(result.status);
  return result.movementId;
}

const expected = async (cashSessionId: string) =>
  (await expectedCash(db, companyId, cashSessionId)).toString();

beforeAll(async () => {
  companyId = (await createCompany(`${tag}-a`)).id;
  otherCompanyId = (await createCompany(`${tag}-b`)).id;
  branchId = (await createMainBranch(companyId)).branchId;
  await createMainBranch(otherCompanyId);
  ana = (await createUser({ companyId, email: `ana@${tag}.co`, role: "CASHIER" })).id;
  beto = (await createUser({ companyId, email: `beto@${tag}.co`, role: "CASHIER" })).id;
  admin = (await createUser({ companyId, email: `admin@${tag}.co`, role: "ADMIN" })).id;
  await db.$transaction((tx) => createDefaultExpenseCategories(tx, companyId));
  await db.$transaction((tx) => createDefaultExpenseCategories(tx, otherCompanyId));
  gas = (await db.expenseCategory.findFirstOrThrow({ where: { companyId, name: "Gas y servicios" } })).id;
  otherCategory = (
    await db.expenseCategory.findFirstOrThrow({ where: { companyId: otherCompanyId, name: "Otros" } })
  ).id;
});
afterAll(() => cleanupCompanies(tag));

describe("categorías de gasto", () => {
  it("las crea el alta de la empresa, en orden", async () => {
    const { companyId: created } = await createCompanyWithOwnerInvitation({
      name: "Alta",
      slug: `${tag}-alta`,
      owner: { name: "Dueña", email: `${tag}-alta@prueba.test` },
      tokenHash: `${tag}-hash`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const categories = await db.expenseCategory.findMany({
      where: { companyId: created },
      orderBy: { position: "asc" },
    });
    expect(categories.map((category) => [category.name, category.isActive])).toEqual(
      DEFAULT_EXPENSE_CATEGORIES.map((name) => [name, true]),
    );
  });

  it("el nombre es único por empresa sin distinguir mayúsculas", async () => {
    await expect(
      db.expenseCategory.create({ data: { companyId, name: "ASEO", position: 9 } }),
    ).rejects.toThrow();
    // En otra empresa sí.
    await expect(
      db.expenseCategory.create({ data: { companyId: otherCompanyId, name: "Hielo", position: 9 } }),
    ).resolves.toBeTruthy();
  });
});

describe("movimientos", () => {
  it("gastos, retiros e ingresos cambian el esperado; la categoría solo va en gastos", async () => {
    const shift = await open(ana);
    await recorded(shift, { amount: "12000.50", note: "Pipeta de gas" });
    await recorded(shift, { type: "WITHDRAWAL", amount: "50000", categoryId: gas });
    await recorded(shift, { type: "DEPOSIT", amount: "20000", categoryId: null });
    // 100.000 − 12.000,50 − 50.000 + 20.000
    expect(await expected(shift)).toBe("57999.5");

    const list = await listSessionCashMovements(companyId, shift);
    expect(list.map((m) => [m.type, m.amount.toString(), m.category?.name ?? null, m.note])).toEqual([
      ["EXPENSE", "12000.5", "Gas y servicios", "Pipeta de gas"],
      ["WITHDRAWAL", "50000", null, null],
      ["DEPOSIT", "20000", null, null],
    ]);
    expect(list.every((m) => m.status === "RECORDED" && m.user)).toBe(true);

    // El cierre ciego compara con el nuevo esperado.
    const closed = await closeCashSession(companyId, {
      cashSessionId: shift,
      userId: ana,
      onlyOwner: true,
      countedCash: "58000",
      closingNote: null,
    });
    expect(closed).toMatchObject({ status: "OK" });
    if (closed.status === "OK") {
      expect(closed.expectedCash.toString()).toBe("57999.5");
      expect(closed.difference.toString()).toBe("0.5");
    }
  });

  it("solo en el turno abierto propio y con una categoría activa de la empresa", async () => {
    const shift = await open(ana);
    expect(await move(shift, { userId: beto })).toEqual({ status: "SESSION_NOT_FOUND" });
    expect(await move("no-existe")).toEqual({ status: "SESSION_NOT_FOUND" });
    expect(
      await recordCashMovement(otherCompanyId, {
        cashSessionId: shift,
        userId: ana,
        type: "DEPOSIT",
        amount: "1",
        categoryId: null,
        note: null,
      }),
    ).toEqual({ status: "SESSION_NOT_FOUND" });

    expect(await move(shift, { categoryId: null })).toEqual({ status: "CATEGORY_NOT_FOUND" });
    expect(await move(shift, { categoryId: otherCategory })).toEqual({ status: "CATEGORY_NOT_FOUND" });
    const aseo = await db.expenseCategory.findFirstOrThrow({ where: { companyId, name: "Aseo" } });
    await db.expenseCategory.update({ where: { id: aseo.id }, data: { isActive: false } });
    expect(await move(shift, { categoryId: aseo.id })).toEqual({ status: "CATEGORY_INACTIVE" });
    await db.expenseCategory.update({ where: { id: aseo.id }, data: { isActive: true } });
    expect(await db.cashMovement.count({ where: { cashSessionId: shift } })).toBe(0);

    await closeCashSession(companyId, {
      cashSessionId: shift,
      userId: ana,
      onlyOwner: true,
      countedCash: "100000",
      closingNote: null,
    });
    expect(await move(shift)).toEqual({ status: "SESSION_CLOSED" });
  });
});

describe("anulación", () => {
  it("lo anulado no cuenta; no se anula dos veces ni con el turno cerrado", async () => {
    const shift = await open(beto, "0");
    const expense = await recorded(shift, { userId: beto, amount: "3000" });
    const deposit = await recorded(shift, { userId: beto, type: "DEPOSIT", amount: "10000", categoryId: null });
    expect(await expected(shift)).toBe("7000");

    const reason = "Lo registró dos veces";
    expect(await voidCashMovement(companyId, { movementId: expense, userId: admin, reason })).toEqual({
      status: "OK",
    });
    expect(await voidCashMovement(companyId, { movementId: expense, userId: admin, reason })).toEqual({
      status: "ALREADY_VOIDED",
    });
    expect(await expected(shift)).toBe("10000");
    const voided = (await listSessionCashMovements(companyId, shift))[0];
    expect(voided).toMatchObject({ status: "VOIDED", voidReason: reason });
    expect(voided.voidedAt).toBeInstanceOf(Date);

    // Otra empresa no lo encuentra.
    expect(
      await voidCashMovement(otherCompanyId, { movementId: deposit, userId: admin, reason }),
    ).toEqual({ status: "NOT_FOUND" });

    await closeCashSession(companyId, {
      cashSessionId: shift,
      userId: beto,
      onlyOwner: true,
      countedCash: "10000",
      closingNote: null,
    });
    expect(await voidCashMovement(companyId, { movementId: deposit, userId: admin, reason })).toEqual({
      status: "SESSION_CLOSED",
    });
  });

  it("dos anulaciones simultáneas: solo una pasa", async () => {
    const shift = await open(admin, "0");
    const movement = await recorded(shift, { userId: admin, type: "WITHDRAWAL", categoryId: null });
    const results = await Promise.all(
      [1, 2].map(() =>
        voidCashMovement(companyId, { movementId: movement, userId: admin, reason: "Error" }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(["ALREADY_VOIDED", "OK"]);
  });
});

describe("reglas de la base de datos", () => {
  it("rechaza datos inconsistentes", async () => {
    const shift = (await db.cashSession.findFirstOrThrow({ where: { companyId, userId: admin } })).id;
    const base = { companyId, cashSessionId: shift, userId: admin, amount: "1000" };
    const invalid = [
      { ...base, type: "EXPENSE" as const },
      { ...base, type: "WITHDRAWAL" as const, categoryId: gas },
      { ...base, type: "DEPOSIT" as const, receiptPath: "x.jpg" },
      { ...base, type: "DEPOSIT" as const, amount: "0" },
      { ...base, type: "DEPOSIT" as const, status: "VOIDED" as const },
      { ...base, type: "DEPOSIT" as const, note: "x".repeat(201) },
      // FK compuesta: categoría de otra empresa.
      { ...base, type: "EXPENSE" as const, categoryId: otherCategory },
    ];
    for (const data of invalid) {
      await expect(db.cashMovement.create({ data })).rejects.toThrow();
    }
  });
});
