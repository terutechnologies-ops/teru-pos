import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { calendarDay } from "@/lib/company-formats";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { getPendingAlerts } from "@/server/services/alerts";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  closeShift,
  closeShiftFromPanel,
  countStaleShifts,
  getCashOverview,
  getCashSessionReview,
  openShift,
} from "@/server/services/cash-sessions";
import { checkout, voidSaleFromPanel } from "@/server/services/sales";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("cashreview");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let ana: StaffSessionDto;
let beto: StaffSessionDto;
let admin: StaffSessionDto;
let cash: string;
let card: string;
let arepa: string;
let anaShift: string;
let betoShift: string;
let betoSale: string;
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function member(name: string, role: StaffRole) {
  const user = await createUser({ companyId: a.id, email: `${name}@${tag}.co`, role, name });
  return sessionFor(a, user.id, role);
}

async function sell(cashier: StaffSessionDto, payments: unknown[]) {
  const result = await checkout(cashier, {
    clientKey: randomUUID(),
    lines: [{ productId: arepa, quantity: 1 }],
    payments,
  });
  if (!result.ok) throw new Error(result.error);
  return (await db.sale.findFirstOrThrow({ where: { companyId: a.id, number: result.number } })).id;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await createMainBranch(a.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  const methods = await db.paymentMethod.findMany({ where: { companyId: a.id } });
  cash = methods.find((m) => m.isCash)!.id;
  card = methods.find((m) => m.name === "Tarjeta")!.id;

  await createProductCategory(a.id, "Arepas");
  const arepas = (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id } })).id;
  const harina = (
    await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, unitCost: null })
  ).id!;
  arepa = (
    await createProduct(a.id, { categoryId: arepas, name: "Arepa", description: null, price: "16500" })
  ).id!;
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });

  ana = await member("Ana", "CASHIER");
  beto = await member("Beto", "CASHIER");
  admin = await member("Carla", "ADMIN");

  // Ana: abre, vende y cierra con 1.500 de faltante.
  await openShift(ana, { branchId: "", openingAmount: "100000" });
  await sell(ana, [{ paymentMethodId: cash, amount: "16500", tendered: "20000" }]);
  await sell(ana, [{ paymentMethodId: card, amount: "16500" }]);
  expect(await closeShift(ana, { countedCash: "115000", closingNote: "" })).toMatchObject({
    ok: true,
  });
  anaShift = (await db.cashSession.findFirstOrThrow({ where: { companyId: a.id, closedAt: { not: null } } })).id;

  // Beto: abrió hace dos días y no cerró.
  await openShift(beto, { branchId: "", openingAmount: "50000" });
  betoSale = await sell(beto, [{ paymentMethodId: cash, amount: "16500" }]);
  betoShift = (await db.cashSession.findFirstOrThrow({ where: { companyId: a.id, closedAt: null } })).id;
  await db.cashSession.update({ where: { id: betoShift }, data: { openedAt: twoDaysAgo } });
});
afterAll(() => cleanupCompanies(tag));

describe("lista de cierres", () => {
  it("muestra los abiertos (aunque sean de otro día) y los cerrados de hoy con su cuadre", async () => {
    const overview = await getCashOverview(admin, {});
    expect(overview.open.map((s) => [s.cashierName, s.stale, s.salesCount])).toEqual([
      ["Beto", true, 1],
    ]);
    expect(overview.closed).toHaveLength(1);
    expect(overview.closed[0]).toMatchObject({
      cashierName: "Ana",
      openingAmount: "100000",
      salesCount: 2,
      closed: {
        expectedCash: "116500",
        countedCash: "115000",
        difference: "-1500",
        byOtherName: null,
      },
    });
    expect(overview.summary).toEqual({
      shortageTotal: "1500",
      shortageCount: 1,
      surplusTotal: "0",
      surplusCount: 0,
    });
    expect(overview.cashiers.map((c) => c.name)).toEqual(["Ana", "Beto"]);
  });

  it("el cierre desde el POS queda a nombre de su cajero", async () => {
    const row = await db.cashSession.findUniqueOrThrow({ where: { id: anaShift } });
    expect(row.closedById).toBe(ana.user.id);
  });

  it("filtra por cajero y no cruza empresas", async () => {
    expect((await getCashOverview(admin, { cajero: beto.user.id })).closed).toEqual([]);
    const other = await getCashOverview(sessionFor(b, "x", "OWNER"), {});
    expect(other.open).toEqual([]);
    expect(other.closed).toEqual([]);
    expect(await getCashSessionReview(sessionFor(b, "x", "OWNER"), anaShift)).toBeNull();
  });

  it("avisa en el inicio de los turnos abiertos de días anteriores", async () => {
    expect(await countStaleShifts(admin)).toBe(1);
    expect((await getPendingAlerts(admin)).staleShifts).toBe(1);
    expect((await getPendingAlerts(ana)).staleShifts).toBeNull();
  });

  it("solo propietario y administrador revisan y cierran", async () => {
    await expect(getCashOverview(ana, {})).rejects.toThrow(ForbiddenError);
    await expect(getCashSessionReview(ana, anaShift)).rejects.toThrow(ForbiddenError);
    await expect(countStaleShifts(ana)).rejects.toThrow(ForbiddenError);
    await expect(
      closeShiftFromPanel(ana, betoShift, { countedCash: "0", closingNote: "Prueba" }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("detalle y cierre desde el panel", () => {
  it("detalle de un turno cerrado: cuadre, métodos y ventas", async () => {
    const review = (await getCashSessionReview(admin, anaShift))!;
    expect(review.canClose).toBe(false);
    expect(review.shift).toMatchObject({
      cashSales: "16500",
      liveExpected: null,
      byMethod: [
        { name: "Efectivo", amount: "16500" },
        { name: "Tarjeta", amount: "16500" },
      ],
      closed: { difference: "-1500" },
    });
    expect(review.shift.sales.map((s) => s.number)).toEqual([2, 1]);
  });

  it("un turno abierto muestra cómo va y se puede cerrar", async () => {
    const review = (await getCashSessionReview(admin, betoShift))!;
    expect(review.canClose).toBe(true);
    expect(review.shift).toMatchObject({ closed: null, liveExpected: "66500", cashSales: "16500" });
  });

  it("valida el conteo y el motivo", async () => {
    expect(await closeShiftFromPanel(admin, betoShift, { countedCash: "abc", closingNote: "" })).toEqual({
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: {
        countedCash: expect.any(String),
        closingNote: "Escribe el motivo del cierre (mínimo 3 caracteres).",
      },
    });
    expect(
      await closeShiftFromPanel(sessionFor(b, "x", "OWNER"), betoShift, {
        countedCash: "0",
        closingNote: "Ajeno",
      }),
    ).toEqual({ ok: false, error: "El turno ya no existe. Actualiza la página." });
  });

  it("cierra el turno olvidado con quién cerró y el motivo", async () => {
    expect(
      await closeShiftFromPanel(admin, betoShift, {
        countedCash: "70.000",
        closingNote: " Olvidó cerrar ",
      }),
    ).toEqual({ ok: true, cashSessionId: betoShift });

    const review = (await getCashSessionReview(admin, betoShift))!;
    expect(review.canClose).toBe(false);
    expect(review.shift.closed).toMatchObject({
      expectedCash: "66500",
      countedCash: "70000",
      difference: "3500",
      byOtherName: "Carla",
      note: "Olvidó cerrar",
    });

    expect(
      await closeShiftFromPanel(admin, betoShift, { countedCash: "0", closingNote: "Otra vez" }),
    ).toEqual({ ok: false, error: "El turno ya estaba cerrado. Actualiza la página." });
    // Sus ventas ya no se anulan, y Beto puede abrir otro turno.
    expect(await voidSaleFromPanel(admin, betoSale, { reason: "Tarde" })).toMatchObject({
      ok: false,
      error: "El turno de esta venta ya se cerró: no se puede anular.",
    });
    expect(await openShift(beto, { branchId: "", openingAmount: "0" })).toMatchObject({ ok: true });
    expect(await countStaleShifts(admin)).toBe(0);
  });

  it("el rango de fechas toma el día de apertura del turno", async () => {
    const day = calendarDay(twoDaysAgo, "America/Bogota");
    const overview = await getCashOverview(admin, { desde: day, hasta: day });
    expect(overview.closed.map((s) => s.cashierName)).toEqual(["Beto"]);
    expect(overview.summary).toEqual({
      shortageTotal: "0",
      shortageCount: 0,
      surplusTotal: "3500",
      surplusCount: 1,
    });
  });
});
