import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { updateClosingReportEmails } from "@/server/data/companies";
import { createSupply, recordStockMovement } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { closeShift, closeShiftFromPanel, openShift } from "@/server/services/cash-sessions";
import { buildClosingReportEmail, sendClosingReportIfLast } from "@/server/services/closing-report";
import { getLastClosingReport } from "@/server/services/companies";
import { setMessageSenderForTesting } from "@/server/services/messaging";
import { listDevOutbox } from "@/server/services/messaging/dev-outbox";
import { checkout } from "@/server/services/sales";
import type { ShoppingListItem } from "@/server/services/shopping-list";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("closereport");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let ana: StaffSessionDto;
let beto: StaffSessionDto;
let owner: StaffSessionDto;
let cash: string;
let card: string;
let arepa: string;
const dueno = `dueno@${tag}.co`;
const socio = `socio@${tag}.co`;

function sessionFor(company: Company, userId: string, role: StaffRole, name: string): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name, email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function member(name: string, role: StaffRole) {
  const user = await createUser({ companyId: a.id, email: `${name}@${tag}.co`, role, name });
  return sessionFor(a, user.id, role, name);
}

async function sell(cashier: StaffSessionDto, payments: unknown[]) {
  const result = await checkout(cashier, {
    clientKey: randomUUID(),
    lines: [{ productId: arepa, quantity: 1 }],
    payments,
  });
  if (!result.ok) throw new Error(result.error);
}

async function open(cashier: StaffSessionDto, openingAmount = "100000") {
  expect(await openShift(cashier, { branchId: "", openingAmount })).toMatchObject({ ok: true });
  return (await db.cashSession.findFirstOrThrow({
    where: { companyId: a.id, userId: cashier.user.id, closedAt: null },
  })).id;
}

async function close(cashier: StaffSessionDto, countedCash: string) {
  const result = await closeShift(cashier, { countedCash, closingNote: "" });
  if (!result.ok) throw new Error(result.error);
  return result.cashSessionId;
}

// Los montos llevan espacio no separable ("$ 500"): se normaliza.
const plain = (text: string) => text.replace(/ /g, " ");
const mailsTo = (email: string) =>
  listDevOutbox()
    .filter((entry) => entry.to === email)
    .map((entry) => ({ ...entry, text: plain(entry.text) }));
const reports = () => db.closingReport.findMany({ where: { companyId: a.id }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Su Arepa");
  b = await createCompany(`${tag}-b`);
  const { warehouseId } = await createMainBranch(a.id);
  await createMainBranch(b.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  const methods = await db.paymentMethod.findMany({ where: { companyId: a.id } });
  cash = methods.find((m) => m.isCash)!.id;
  card = methods.find((m) => m.name === "Tarjeta")!.id;

  ana = await member("Ana", "CASHIER");
  beto = await member("Beto", "CASHIER");
  owner = await member("Olga", "OWNER");

  await createProductCategory(a.id, "Arepas");
  const arepas = (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id } })).id;
  const harina = (
    await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, idealStock: "5", unitCost: null })
  ).id!;
  await recordStockMovement(a.id, {
    warehouseId,
    supplyId: harina,
    type: "INITIAL",
    quantity: "2",
    reason: null,
    userId: owner.user.id,
  });
  await createSupply(a.id, { name: "Queso", unit: "KG", minStock: null, idealStock: null, unitCost: null });
  arepa = (
    await createProduct(a.id, { categoryId: arepas, name: "Arepa", description: null, price: "16500" })
  ).id!;
  await addRecipeItem(a.id, arepa, harina, { quantity: "500", unit: "G" });
  await updateClosingReportEmails(a.id, [dueno, socio]);
});
afterEach(() => setMessageSenderForTesting(null));
afterAll(() => cleanupCompanies(tag));

describe("reporte de cierre", () => {
  it("no sale mientras quede un turno abierto; al cerrar el último va a cada destinatario", async () => {
    const anaShift = await open(ana);
    const betoShift = await open(beto, "50000");
    await sell(ana, [{ paymentMethodId: cash, amount: "16500", tendered: "20000" }]);
    await sell(ana, [{ paymentMethodId: card, amount: "16500" }]);
    await sell(beto, [{ paymentMethodId: cash, amount: "16500" }]);

    // Ana cierra con 1.500 de faltante; Beto sigue abierto.
    expect(await close(ana, "115000")).toBe(anaShift);
    expect(await sendClosingReportIfLast(a.id, anaShift)).toBeNull();
    expect(await reports()).toEqual([]);

    // Un administrador cierra el turno de Beto desde el panel, cuadrado.
    expect(
      await closeShiftFromPanel(owner, betoShift, { countedCash: "66500", closingNote: "Se fue sin cerrar" }),
    ).toMatchObject({ ok: true });
    const before = listDevOutbox().length;
    expect(await sendClosingReportIfLast(a.id, betoShift)).toBe("SENT");
    expect(listDevOutbox().length).toBe(before + 2);

    const [mail] = mailsTo(socio);
    expect(mailsTo(dueno)).toHaveLength(1);
    expect(mail.subject).toMatch(/^Cierre del día · Su Arepa · \d\d\/\d\d\/\d{4} · 1 insumo por comprar$/);
    // 3 arepas × 500 g = 1,5 kg de 2 kg: quedan 0,5; ideal 5 → comprar 4,5.
    expect(mail.text).toContain("2 turnos cerrados.");
    expect(mail.text).toContain("• Harina: comprar 4,5 kg (quedan 0,5 kg; ideal 5 kg)");
    expect(mail.text).toContain("• Queso: sin carga inicial");
    expect(mail.text).toContain("Ventas: 3 por $ 49.500");
    expect(mail.text).toMatch(/Efectivo: \$ 33\.000/);
    expect(mail.text).toMatch(/Tarjeta: \$ 16\.500/);
    expect(mail.text).toMatch(/• Ana, cerró a las .+: faltante \$ 1\.500/);
    expect(mail.text).toMatch(/• Beto, cerró a las .+: cuadrada/);
    expect(mail.text).toContain(`/${a.slug}/inventario/lista-de-compras`);

    const [report] = await reports();
    expect(report).toMatchObject({
      cashSessionId: betoShift,
      status: "SENT",
      recipientCount: 2,
      sentCount: 2,
      error: null,
    });
    expect(report.finishedAt).not.toBeNull();
  });

  it("no se repite: el mismo cierre o uno sin turnos nuevos no reserva otro", async () => {
    const { cashSessionId } = (await reports())[0];
    expect(await sendClosingReportIfLast(a.id, cashSessionId)).toBeNull();
    expect(await reports()).toHaveLength(1);
  });

  it("con dos cierres a la vez sale un solo reporte, que cubre ambos turnos", async () => {
    const anaShift = await open(ana);
    const betoShift = await open(beto);
    await close(ana, "100000");
    await close(beto, "100000");
    const before = mailsTo(dueno).length;
    const outcomes = await Promise.all([
      sendClosingReportIfLast(a.id, anaShift),
      sendClosingReportIfLast(a.id, betoShift),
    ]);
    expect(outcomes.filter((outcome) => outcome === "SENT")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1);
    expect(await reports()).toHaveLength(2);
    expect(mailsTo(dueno)).toHaveLength(before + 1);
    // Solo los turnos posteriores al reporte anterior.
    expect(mailsTo(dueno)[0].text).toContain("2 turnos cerrados.");
    expect(mailsTo(dueno)[0].text).toContain("Ventas: 0 por $ 0");
  });

  it("si un envío falla queda FAILED con el motivo; sin destinatarios queda SKIPPED", async () => {
    setMessageSenderForTesting({
      async sendEmail(message) {
        if (message.to === socio) throw new Error("Proveedor no disponible");
      },
    });
    const shift = await open(ana);
    await close(ana, "100000");
    expect(await sendClosingReportIfLast(a.id, shift)).toBe("FAILED");
    expect((await reports()).at(-1)).toMatchObject({
      status: "FAILED",
      sentCount: 1,
      error: "Proveedor no disponible",
    });
    expect(await getLastClosingReport(owner)).toMatchObject({
      status: "FAILED",
      recipientCount: 2,
      sentCount: 1,
    });

    setMessageSenderForTesting(null);
    await updateClosingReportEmails(a.id, []);
    const before = listDevOutbox().length;
    const next = await open(ana);
    await close(ana, "100000");
    expect(await sendClosingReportIfLast(a.id, next)).toBe("SKIPPED");
    expect(listDevOutbox().length).toBe(before);
    expect((await reports()).at(-1)).toMatchObject({ status: "SKIPPED", recipientCount: 0 });
    await updateClosingReportEmails(a.id, [dueno, socio]);
  });

  it("el último reporte solo lo ve el propietario de su empresa", async () => {
    expect(await getLastClosingReport(owner)).toMatchObject({ status: "SKIPPED" });
    expect(await getLastClosingReport(sessionFor(b, "x", "OWNER", "Otro"))).toBeNull();
    await expect(getLastClosingReport(sessionFor(a, "x", "ADMIN", "Adm"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("buildClosingReportEmail", () => {
  const zero = new Prisma.Decimal(0);
  const item = (name: string, fields: Partial<ShoppingListItem> = {}): ShoppingListItem => ({
    id: name,
    name,
    unit: "KG",
    totalStock: "1",
    idealStock: null,
    uninitialized: false,
    negativeStock: false,
    belowMinimum: false,
    toBuy: null,
    ...fields,
  });
  const base = {
    companyName: "Su Arepa",
    shoppingListUrl: "https://app.test/su-arepa/inventario/lista-de-compras",
    currency: "COP",
    dateFormat: "DD/MM/YYYY" as const,
    timeZone: "America/Bogota",
    cutoff: new Date("2026-10-07T03:30:00Z"),
    period: {
      sessions: [],
      sales: { count: 0, total: zero, voidedCount: 0, voidedTotal: zero, byMethod: [] },
      cash: { expenses: zero, withdrawals: zero, deposits: zero },
    },
  };

  it("sin ideal lo explica, resume la lista larga y usa el día de la empresa", () => {
    const email = buildClosingReportEmail({
      ...base,
      shopping: {
        toBuy: [],
        enough: [],
        noSuggestion: Array.from({ length: 17 }, (_, i) => item(`Insumo ${i + 1}`)),
      },
    });
    email.text = plain(email.text);
    // 03:30 UTC del 7 = 22:30 del 6 en Bogotá.
    expect(email.subject).toBe("Cierre del día · Su Arepa · 06/10/2026 · nada por comprar");
    expect(email.text).toContain("Ningún insumo tiene stock ideal");
    expect(email.text).toContain("• Insumo 15: quedan 1 kg");
    expect(email.text).not.toContain("Insumo 16:");
    expect(email.text).toContain("  y 2 más.");
  });

  it("marca el saldo negativo, las anuladas, retiros e ingresos y la sucursal con varias", () => {
    const email = buildClosingReportEmail({
      ...base,
      shopping: {
        toBuy: [
          item("Gaseosa", { unit: "UNIT", totalStock: "-3", idealStock: "24", toBuy: "24", negativeStock: true }),
        ],
        enough: [item("Sal", { idealStock: "1" })],
        noSuggestion: [],
      },
      period: {
        sessions: [
          {
            id: "1",
            closedAt: new Date("2026-10-07T01:00:00Z"),
            expectedCash: new Prisma.Decimal("100000"),
            countedCash: new Prisma.Decimal("102000"),
            user: { name: "Ana" },
            branch: { name: "Centro" },
          },
          {
            id: "2",
            closedAt: new Date("2026-10-07T02:00:00Z"),
            expectedCash: new Prisma.Decimal("50000"),
            countedCash: new Prisma.Decimal("50000"),
            user: { name: "Beto" },
            branch: { name: "Norte" },
          },
        ],
        sales: {
          count: 1,
          total: new Prisma.Decimal("16500"),
          voidedCount: 1,
          voidedTotal: new Prisma.Decimal("3000"),
          byMethod: [],
        },
        cash: {
          expenses: new Prisma.Decimal("5000"),
          withdrawals: new Prisma.Decimal("20000"),
          deposits: zero,
        },
      },
    });
    email.text = plain(email.text);
    expect(email.subject).toContain("1 insumo por comprar");
    expect(email.text).toContain(
      "• Gaseosa: comprar 24 und (saldo negativo −3 und, cuenta como 0; ideal 24 und)",
    );
    expect(email.text).toContain("Alcanzan: 1 insumo.");
    expect(email.text).toContain("Anuladas: 1 por $ 3.000");
    expect(email.text).toContain("Gastos: $ 5.000");
    expect(email.text).toContain("Retiros: $ 20.000");
    expect(email.text).not.toContain("Ingresos:");
    expect(email.text).toMatch(/• Ana \(Centro\), cerró a las .+: sobrante \$ 2\.000/);
    expect(email.text).toMatch(/• Beto \(Norte\), cerró a las .+: cuadrada/);
  });
});
