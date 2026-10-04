import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createDefaultExpenseCategories, recordCashMovement } from "@/server/data/cash-movements";
import { openCashSession } from "@/server/data/cash-sessions";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  getExpenseCategories,
  moveExpenseCategory,
  renameExpenseCategory,
  setExpenseCategoryActive,
} from "@/server/services/expense-categories";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("expcat");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let userA: string;
let branchA: string;

function sessionFor(company: Company, userId: string, role: StaffRole = "ADMIN"): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

const admin = () => sessionFor(a, userA);
const names = async (session = admin()) => (await getExpenseCategories(session)).map((c) => c.name);
const idOf = async (name: string, session = admin()) =>
  (await getExpenseCategories(session)).find((c) => c.name === name)!.id;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  branchA = (await createMainBranch(a.id)).branchId;
  userA = (await createUser({ companyId: a.id, email: `admin@${tag}.co`, role: "ADMIN" })).id;
  await db.$transaction((tx) => createDefaultExpenseCategories(tx, a.id));
  await db.$transaction((tx) => createDefaultExpenseCategories(tx, b.id));
});
afterAll(() => cleanupCompanies(tag));

describe("categorías de gasto", () => {
  it("crea al final, valida el nombre y no repite", async () => {
    expect(await createExpenseCategory(admin(), "  Hielo  ")).toEqual({ ok: true });
    expect(await names()).toEqual([
      "Domicilios y transporte",
      "Gas y servicios",
      "Aseo",
      "Compras menores",
      "Otros",
      "Hielo",
    ]);
    expect(await createExpenseCategory(admin(), "hielo")).toEqual({
      ok: false,
      error: "Ya existe una categoría con ese nombre.",
    });
    expect(await createExpenseCategory(admin(), "x")).toMatchObject({ ok: false });
    expect(await createExpenseCategory(admin(), "x".repeat(41))).toMatchObject({ ok: false });
  });

  it("renombra y ordena", async () => {
    const hielo = await idOf("Hielo");
    expect(await renameExpenseCategory(admin(), hielo, "Hielo y bolsas")).toEqual({ ok: true });
    expect(await renameExpenseCategory(admin(), hielo, "ASEO")).toMatchObject({ ok: false });
    expect(await moveExpenseCategory(admin(), hielo, "up")).toEqual({ ok: true });
    expect((await names()).slice(-2)).toEqual(["Hielo y bolsas", "Otros"]);
    const first = await idOf("Domicilios y transporte");
    expect(await moveExpenseCategory(admin(), first, "up")).toMatchObject({ ok: false });
  });

  it("solo se elimina si nunca se usó", async () => {
    const shift = await openCashSession(a.id, { userId: userA, branchId: branchA, openingAmount: "0" });
    if (shift.status !== "OK") throw new Error(shift.status);
    const aseo = await idOf("Aseo");
    await recordCashMovement(a.id, {
      cashSessionId: shift.cashSessionId,
      userId: userA,
      type: "EXPENSE",
      amount: "2000",
      categoryId: aseo,
      note: null,
    });

    const list = await getExpenseCategories(admin());
    expect(list.find((c) => c.id === aseo)).toMatchObject({ expenseCount: 1, canDelete: false });
    expect(await deleteExpenseCategory(admin(), aseo)).toEqual({
      ok: false,
      error: "La categoría ya tiene gastos: desactívala en lugar de eliminarla.",
    });
    expect(await deleteExpenseCategory(admin(), await idOf("Hielo y bolsas"))).toEqual({ ok: true });
    expect(await names()).not.toContain("Hielo y bolsas");
  });

  it("siempre queda una activa", async () => {
    const [keep, ...others] = (await getExpenseCategories(admin())).map((c) => c.id);
    for (const id of others) {
      expect(await setExpenseCategoryActive(admin(), id, false)).toEqual({ ok: true });
    }
    const lastActive = {
      ok: false,
      error: "Debe quedar al menos una categoría activa para registrar gastos.",
    };
    expect(await setExpenseCategoryActive(admin(), keep, false)).toEqual(lastActive);
    // Tampoco se elimina la única activa, aunque nunca se haya usado.
    expect(await deleteExpenseCategory(admin(), keep)).toEqual(lastActive);
    // Una inactiva sin gastos sí se elimina.
    expect(await deleteExpenseCategory(admin(), await idOf("Otros"))).toEqual({ ok: true });
  });

  it("desactivar las dos últimas a la vez no deja ninguna activa", async () => {
    const gas = await idOf("Gas y servicios");
    const domicilios = await idOf("Domicilios y transporte");
    expect(await setExpenseCategoryActive(admin(), gas, true)).toEqual({ ok: true });
    const results = await Promise.all(
      [gas, domicilios].map((id) => setExpenseCategoryActive(admin(), id, false)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await getExpenseCategories(admin())).filter((c) => c.isActive)).toHaveLength(1);
  });
});

describe("aislamiento y permisos", () => {
  it("otra empresa no ve ni cambia las categorías", async () => {
    const other = sessionFor(b, userA);
    const aseo = await idOf("Aseo");
    expect(await names(other)).not.toContain("Hielo y bolsas");
    expect(await renameExpenseCategory(other, aseo, "Robado")).toMatchObject({ ok: false });
    expect(await setExpenseCategoryActive(other, aseo, false)).toMatchObject({ ok: false });
    expect(await deleteExpenseCategory(other, aseo)).toMatchObject({ ok: false });
    expect(await moveExpenseCategory(other, aseo, "down")).toMatchObject({ ok: false });
    expect(await names()).toContain("Aseo");
  });

  it("cajeros y personal no configuran categorías", async () => {
    for (const role of ["CASHIER", "STAFF"] as const) {
      const session = sessionFor(a, userA, role);
      await expect(getExpenseCategories(session)).rejects.toThrow(ForbiddenError);
      await expect(createExpenseCategory(session, "Nueva")).rejects.toThrow(ForbiddenError);
      await expect(deleteExpenseCategory(session, "x")).rejects.toThrow(ForbiddenError);
    }
  });
});
