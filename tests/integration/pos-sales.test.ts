import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { openShift } from "@/server/services/cash-sessions";
import { checkout, getPosCatalog } from "@/server/services/sales";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("pos");
type Company = { id: string; name: string; slug: string };
let a: Company;
let cashier: StaffSessionDto;
let cash: string;
let card: string;
let arepa: string;
let jugo: string;
let agotado: string;

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function category(name: string) {
  await createProductCategory(a.id, name);
  return (await db.productCategory.findFirstOrThrow({ where: { companyId: a.id, name } })).id;
}

async function product(categoryId: string, name: string, price: string) {
  return (await createProduct(a.id, { categoryId, name, description: null, price })).id!;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  await createMainBranch(a.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, a.id));
  const methods = await db.paymentMethod.findMany({ where: { companyId: a.id } });
  cash = methods.find((m) => m.isCash)!.id;
  card = methods.find((m) => m.name === "Tarjeta")!.id;
  // Transferencia inactiva: no se ofrece al cobrar.
  await db.paymentMethod.updateMany({
    where: { companyId: a.id, name: "Transferencia" },
    data: { isActive: false },
  });

  const arepas = await category("Arepas");
  const bebidas = await category("Bebidas");
  const viejas = await category("Viejas");
  await db.productCategory.update({ where: { id: viejas }, data: { isActive: false } });

  const harina = (await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, idealStock: null, unitCost: null })).id!;
  arepa = await product(arepas, "Arepa de queso", "16500");
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });
  agotado = await product(arepas, "Arepa de pollo", "18000");
  await addRecipeItem(a.id, agotado, harina, { quantity: "120", unit: "G" });
  await db.product.update({ where: { id: agotado }, data: { isAvailable: false } });
  const archivado = await product(arepas, "Arepa vieja", "1000");
  await db.product.update({ where: { id: archivado }, data: { isArchived: true } });
  jugo = await product(bebidas, "Jugo", "6000");
  await product(viejas, "Oculto", "1000");

  const user = await createUser({ companyId: a.id, email: `cajero@${tag}.co`, role: "CASHIER" });
  cashier = sessionFor(a, user.id, "CASHIER");
});
afterAll(() => cleanupCompanies(tag));

describe("catálogo del POS", () => {
  it("muestra categorías activas en orden, sin archivados, con el motivo de bloqueo", async () => {
    const catalog = await getPosCatalog(cashier);
    expect(catalog.currency).toBe("COP");
    expect(
      catalog.categories.map((c) => [c.name, c.products.map((p) => [p.name, p.blocked])]),
    ).toEqual([
      [
        "Arepas",
        [
          ["Arepa de pollo", "UNAVAILABLE"],
          ["Arepa de queso", null],
        ],
      ],
      ["Bebidas", [["Jugo", "NO_RECIPE"]]],
    ]);
    expect(catalog.paymentMethods.map((m) => m.name)).toEqual(["Efectivo", "Tarjeta"]);
  });
});

describe("cobro", () => {
  it("sin turno abierto no se cobra", async () => {
    expect(
      await checkout(cashier, {
        clientKey: randomUUID(),
        lines: [{ productId: arepa, quantity: 1 }],
        payments: [{ paymentMethodId: cash, amount: "16500" }],
      }),
    ).toEqual({ ok: false, error: "Tu turno ya no está abierto.", refresh: true });
  });

  it("cobra con pago mixto y devuelve número, total y cambio", async () => {
    expect((await openShift(cashier, { branchId: "", openingAmount: "0" })).ok).toBe(true);
    const result = await checkout(cashier, {
        clientKey: randomUUID(),
      lines: [{ productId: arepa, quantity: 2, note: " sin sal " }],
      payments: [
        { paymentMethodId: cash, amount: "20000", tendered: "50000" },
        { paymentMethodId: card, amount: "13000", tendered: null },
      ],
    });
    const sale = await db.sale.findFirstOrThrow({ where: { companyId: a.id } });
    expect(result).toEqual({
      ok: true,
      saleId: sale.id,
      number: 1,
      total: "33000",
      change: "30000",
      alreadyRecorded: false,
    });
    const line = await db.saleLine.findFirstOrThrow({ where: { companyId: a.id } });
    expect(line.note).toBe("sin sal");
  });

  it("valida el pedido antes de tocar la base", async () => {
    const pay = [{ paymentMethodId: cash, amount: "16500" }];
    const cases: [unknown, string][] = [
      [{ lines: [], payments: pay }, "Agrega al menos un producto."],
      [{ lines: [{ productId: arepa, quantity: 0 }], payments: pay }, expect.any(String)],
      [{ lines: [{ productId: arepa, quantity: 1.5 }], payments: pay }, expect.any(String)],
      [
        { lines: [{ productId: arepa, quantity: 1000 }], payments: pay },
        "La cantidad máxima por línea es 999.",
      ],
      [
        {
          lines: [{ productId: arepa, quantity: 1 }],
          payments: [
            { paymentMethodId: cash, amount: "10000" },
            { paymentMethodId: cash, amount: "6500" },
          ],
        },
        "Usa cada método de pago una sola vez.",
      ],
      [
        { lines: [{ productId: arepa, quantity: 1 }], payments: [{ paymentMethodId: cash, amount: "0" }] },
        "Cada pago debe ser mayor que cero.",
      ],
      ["basura", expect.any(String)],
    ];
    for (const [input, error] of cases) {
      const withKey = typeof input === "object" ? { clientKey: randomUUID(), ...input } : input;
      expect(await checkout(cashier, withKey)).toEqual({ ok: false, error, refresh: false });
    }
    // Sin clave del pedido tampoco.
    expect(
      await checkout(cashier, { lines: [{ productId: arepa, quantity: 1 }], payments: pay }),
    ).toEqual({ ok: false, error: expect.any(String), refresh: false });
  });

  it("el mismo pedido enviado dos veces no se cobra dos veces", async () => {
    const order = {
      clientKey: randomUUID(),
      lines: [{ productId: arepa, quantity: 1 }],
      payments: [{ paymentMethodId: cash, amount: "16500", tendered: "20000" }],
    };
    const first = await checkout(cashier, order);
    expect(first).toMatchObject({ ok: true, alreadyRecorded: false, change: "3500" });
    // Reintento tras perder la respuesta: devuelve la misma venta.
    const retry = await checkout(cashier, order);
    expect(retry).toEqual({ ...first, alreadyRecorded: true });
    expect(await db.sale.count({ where: { companyId: a.id, clientKey: order.clientKey } })).toBe(1);

    // Dos envíos simultáneos (doble toque): una sola venta.
    const twin = { ...order, clientKey: randomUUID() };
    const results = await Promise.all([checkout(cashier, twin), checkout(cashier, twin)]);
    expect(results.map((r) => r.ok && r.alreadyRecorded).sort()).toEqual([false, true]);
    expect(await db.sale.count({ where: { companyId: a.id, clientKey: twin.clientKey } })).toBe(1);
  });

  it("explica por qué no se vende un producto, con su nombre", async () => {
    const pay = (amount: string) => [{ paymentMethodId: card, amount }];
    expect(
      await checkout(cashier, { clientKey: randomUUID(), lines: [{ productId: jugo, quantity: 1 }], payments: pay("6000") }),
    ).toEqual({
      ok: false,
      error: "Jugo no tiene receta y no se puede vender. Avisa al administrador.",
      refresh: true,
    });
    expect(
      await checkout(cashier, { clientKey: randomUUID(), lines: [{ productId: agotado, quantity: 1 }], payments: pay("18000") }),
    ).toEqual({
      ok: false,
      error: "Arepa de pollo ya no está disponible. Quítalo del pedido.",
      refresh: true,
    });
    expect(
      await checkout(cashier, { clientKey: randomUUID(), lines: [{ productId: arepa, quantity: 1 }], payments: pay("1000") }),
    ).toEqual({ ok: false, error: "Los pagos deben sumar exactamente el total.", refresh: false });
  });

  it("solo quien tiene sales.charge vende", async () => {
    const staff = sessionFor(a, "staff", "STAFF");
    await expect(getPosCatalog(staff)).rejects.toThrow(ForbiddenError);
    await expect(checkout(staff, {})).rejects.toThrow(ForbiddenError);
  });
});
