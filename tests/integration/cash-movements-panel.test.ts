import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createDefaultExpenseCategories } from "@/server/data/cash-movements";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  getCashMovementsOverview,
  getShiftCashMovements,
  registerCashMovement,
  voidCashMovementFromPanel,
} from "@/server/services/cash-movements";
import {
  closeShift,
  getCashSessionReview,
  getPrintableShift,
  openShift,
} from "@/server/services/cash-sessions";
import type { CashMovementInput } from "@/server/validations/cash-movements";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("cashmovpanel");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let ana: StaffSessionDto;
let beto: StaffSessionDto;
let admin: StaffSessionDto;
let otherAdmin: StaffSessionDto;
let gas: string;
let aseo: string;
let anaShift: string;

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function member(company: Company, name: string, role: StaffRole) {
  const user = await createUser({ companyId: company.id, email: `${name}@${tag}.co`, role, name });
  return sessionFor(company, user.id, role);
}

const movement = (input: Partial<CashMovementInput> = {}): CashMovementInput => ({
  type: "EXPENSE",
  amount: "5.000",
  categoryId: gas,
  note: "",
  ...input,
});

async function register(session: StaffSessionDto, input: Partial<CashMovementInput>) {
  const result = await registerCashMovement(session, movement(input));
  if (!result.ok) throw new Error(result.error);
  return (await getShiftCashMovements(session)).movements.at(-1)!.id;
}

async function open(session: StaffSessionDto, openingAmount: string) {
  const result = await openShift(session, { branchId: "", openingAmount });
  if (!result.ok) throw new Error(result.error);
  return result.cashSessionId;
}

let gasId: string;
let withdrawalId: string;
let depositId: string;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await createMainBranch(a.id);
  await db.$transaction((tx) => createDefaultExpenseCategories(tx, a.id));
  const category = (name: string) =>
    db.expenseCategory.findFirstOrThrow({ where: { companyId: a.id, name } });
  gas = (await category("Gas y servicios")).id;
  aseo = (await category("Aseo")).id;
  ana = await member(a, "ana", "CASHIER");
  beto = await member(a, "beto", "CASHIER");
  admin = await member(a, "admin", "ADMIN");
  otherAdmin = await member(b, "otro", "ADMIN");

  anaShift = await open(ana, "100.000");
  gasId = await register(ana, { amount: "5.000", note: "Pipeta" });
  withdrawalId = await register(ana, { type: "WITHDRAWAL", amount: "20.000" });
  depositId = await register(ana, { type: "DEPOSIT", amount: "10.000" });
});
afterAll(async () => {
  await cleanupCompanies(tag);
});

describe("detalle del turno en el panel", () => {
  it("el cuadre incluye los movimientos y se pueden anular con el turno abierto", async () => {
    const review = await getCashSessionReview(admin, anaShift);
    expect(review?.canVoidMovements).toBe(true);
    expect(review?.shift.cash).toEqual({
      sales: "0",
      deposits: "10000",
      expenses: "5000",
      withdrawals: "20000",
    });
    // 100.000 + 10.000 − 5.000 − 20.000
    expect(review?.shift.liveExpected).toBe("85000");
    expect(review?.shift.movements.map((m) => m.id)).toEqual([gasId, withdrawalId, depositId]);
  });

  it("anula con motivo, una sola vez, y deja de contar en el esperado", async () => {
    expect(await voidCashMovementFromPanel(admin, gasId, { reason: "x" })).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
    });
    expect(await voidCashMovementFromPanel(admin, gasId, { reason: "Se registró dos veces" })).toEqual({
      ok: true,
    });
    expect(await voidCashMovementFromPanel(admin, gasId, { reason: "Otra vez" })).toEqual({
      ok: false,
      error: "Este movimiento ya estaba anulado.",
      fieldErrors: {},
    });

    const review = await getCashSessionReview(admin, anaShift);
    expect(review?.shift.cash.expenses).toBe("0");
    expect(review?.shift.liveExpected).toBe("90000");
    expect(review?.shift.movements[0].voided).toMatchObject({
      byName: "admin",
      reason: "Se registró dos veces",
    });
  });

  it("no anula movimientos de otra empresa ni lo hace un cajero", async () => {
    expect(await voidCashMovementFromPanel(otherAdmin, depositId, { reason: "Ajeno" })).toEqual({
      ok: false,
      error: "El movimiento ya no existe. Actualiza la página.",
      fieldErrors: {},
    });
    await expect(voidCashMovementFromPanel(ana, depositId, { reason: "Propio" })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("con el turno cerrado ya no se anula, y la hoja impresa trae los movimientos", async () => {
    // 100.000 + 10.000 − 20.000 (el gasto se anuló)
    expect(await closeShift(ana, { countedCash: "90.000", closingNote: "" })).toMatchObject({
      ok: true,
    });
    expect((await getCashSessionReview(admin, anaShift))?.canVoidMovements).toBe(false);
    expect(await voidCashMovementFromPanel(admin, depositId, { reason: "Tarde" })).toEqual({
      ok: false,
      error: "El turno de este movimiento ya se cerró: no se puede anular.",
      fieldErrors: {},
    });

    const printable = await getPrintableShift(admin, anaShift);
    expect(printable?.shift).toMatchObject({
      expectedCash: "90000",
      difference: "0",
      cash: { sales: "0", deposits: "10000", expenses: "0", withdrawals: "20000" },
      voidedMovementsCount: 1,
    });
    expect(printable?.shift.movements.map((m) => [m.type, m.amount, m.categoryName])).toEqual([
      ["WITHDRAWAL", "20000", null],
      ["DEPOSIT", "10000", null],
    ]);
  });
});

describe("página de gastos", () => {
  beforeAll(async () => {
    await open(beto, "50.000");
    await register(beto, { amount: "8.000", categoryId: aseo });
    await register(beto, { amount: "2.000", categoryId: gas });
    await register(beto, { amount: "4.000", categoryId: aseo });
  });

  it("resume el día por categoría, con retiros e ingresos aparte y sin anulados", async () => {
    const overview = await getCashMovementsOverview(admin, {});
    expect(overview.filters).toMatchObject({ from: overview.today, to: overview.today, view: "" });
    expect(overview.summary).toEqual({
      expenses: {
        total: "14000",
        count: 3,
        byCategory: [
          { name: "Aseo", amount: "12000", count: 2 },
          { name: "Gas y servicios", amount: "2000", count: 1 },
        ],
      },
      withdrawals: { total: "20000", count: 1 },
      deposits: { total: "10000", count: 1 },
      voidedCount: 1,
      voidedTotal: "5000",
    });
    // Todos, también el anulado; el más reciente primero, con su turno.
    expect(overview.movements).toHaveLength(6);
    expect(overview.movements[0]).toMatchObject({ amount: "4000", cashierName: "beto" });
    expect(overview.movements.at(-1)).toMatchObject({
      id: gasId,
      cashSessionId: anaShift,
      voided: expect.any(Object),
    });
    expect(overview.totalCount).toBe(6);
  });

  it("filtra por tipo, categoría, cajero y fechas sin cambiar el resumen", async () => {
    const view = async (query: Parameters<typeof getCashMovementsOverview>[1]) => {
      const overview = await getCashMovementsOverview(admin, query);
      return { overview, amounts: overview.movements.map((m) => m.amount) };
    };

    const expenses = await view({ ver: "gastos" });
    expect(expenses.amounts).toEqual(["4000", "2000", "8000", "5000"]);
    expect(expenses.overview.summary.expenses.total).toBe("14000");

    expect((await view({ ver: aseo })).amounts).toEqual(["4000", "8000"]);
    expect((await view({ ver: "retiros" })).amounts).toEqual(["20000"]);
    expect((await view({ ver: "ingresos" })).amounts).toEqual(["10000"]);

    const byCashier = await view({ cajero: ana.user.id });
    expect(byCashier.amounts).toEqual(["10000", "20000", "5000"]);
    expect(byCashier.overview.summary.expenses.total).toBe("0");

    // Un valor desconocido muestra todo.
    for (const ver of ["otra-cosa", "constructor"]) {
      const unknown = await view({ ver });
      expect(unknown.overview.filters.view).toBe("");
      expect(unknown.amounts).toHaveLength(6);
    }

    const past = await view({ desde: "2020-01-01", hasta: "2020-01-31" });
    expect(past.amounts).toEqual([]);
    expect(past.overview.summary.expenses).toEqual({ total: "0", count: 0, byCategory: [] });
  });

  it("no cruza empresas y solo la ve quien revisa cierres", async () => {
    const other = await getCashMovementsOverview(otherAdmin, {});
    expect(other.movements).toEqual([]);
    expect(other.summary.voidedCount).toBe(0);
    // Una categoría de otra empresa no filtra.
    expect((await getCashMovementsOverview(otherAdmin, { ver: aseo })).filters.view).toBe("");

    await expect(getCashMovementsOverview(ana, {})).rejects.toThrow(ForbiddenError);
    await expect(
      getCashMovementsOverview(sessionFor(a, admin.user.id, "STAFF"), {}),
    ).rejects.toThrow(ForbiddenError);
  });
});
