import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply } from "@/server/data/inventory";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { openShift } from "@/server/services/cash-sessions";
import type { PlatformSessionDto } from "@/server/services/platform/auth";
import { getPlatformCompanies, getPlatformCompany } from "@/server/services/platform/companies";
import { checkout, voidSaleFromPanel } from "@/server/services/sales";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("teru-empresas");
afterAll(() => cleanupCompanies(tag));

const teru: PlatformSessionDto = {
  sessionId: "s",
  expiresAt: new Date(),
  user: { id: "teru", name: "Equipo Teru", email: "equipo@teru.co" },
};

let vende: { id: string; slug: string };
let nueva: { id: string };
let apagada: { id: string };
let saleIds: string[] = [];

beforeAll(async () => {
  vende = await createCompany(`${tag}-vende`, "Vende Mucho");
  nueva = await createCompany(`${tag}-nueva`, "Recién Creada");
  apagada = await createCompany(`${tag}-apagada`, "Apagada");
  await db.company.update({ where: { id: vende.id }, data: { setupCompletedAt: new Date(), taxId: "900.123.456-7" } });
  await db.company.update({ where: { id: apagada.id }, data: { isActive: false, setupCompletedAt: new Date(), deactivatedAt: new Date(), deactivationReason: "Prueba" } });

  await createMainBranch(vende.id);
  await db.$transaction((tx) => createDefaultPaymentMethods(tx, vende.id));
  const cash = (await db.paymentMethod.findFirstOrThrow({ where: { companyId: vende.id, isCash: true } })).id;
  const owner = await createUser({ companyId: vende.id, email: `olga@${tag}.co`, name: "Olga", role: "OWNER" });
  await createUser({ companyId: vende.id, email: `caja@${tag}.co`, name: "Caja", role: "CASHIER" });
  await createUser({ companyId: vende.id, email: `ex@${tag}.co`, name: "Ex", role: "CASHIER", isActive: false });
  await db.user.update({ where: { id: owner.id }, data: { lastLoginAt: new Date("2026-10-01T15:00:00Z") } });

  await createProductCategory(vende.id, "Arepas");
  const category = (await db.productCategory.findFirstOrThrow({ where: { companyId: vende.id } })).id;
  const harina = (await createSupply(vende.id, { name: "Harina", unit: "KG", minStock: null, idealStock: null, unitCost: null })).id!;
  const arepa = (await createProduct(vende.id, { categoryId: category, name: "Arepa", description: null, price: "10000" })).id!;
  await addRecipeItem(vende.id, arepa, harina, { quantity: "100", unit: "G" });

  const session: StaffSessionDto = {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: owner.id, name: "Olga", email: owner.email, role: "OWNER" },
    company: { id: vende.id, name: "Vende Mucho", slug: vende.slug, setupCompletedAt: new Date(), logoPath: null },
  };
  expect(await openShift(session, { branchId: "", openingAmount: "0" })).toMatchObject({ ok: true });
  for (let i = 0; i < 4; i++) {
    const result = await checkout(session, {
      clientKey: randomUUID(),
      lines: [{ productId: arepa, quantity: 1 }],
      payments: [{ paymentMethodId: cash, amount: "10000" }],
    });
    if (!result.ok) throw new Error(result.error);
  }
  saleIds = (await db.sale.findMany({ where: { companyId: vende.id }, orderBy: { number: "asc" }, select: { id: true } })).map((s) => s.id);
  // Una anulada (no cuenta) y una de hace 40 días (fuera del período, pero
  // es la "última venta" si no hubiera otras).
  expect(await voidSaleFromPanel(session, saleIds[0], { reason: "Error de cobro" })).toMatchObject({ ok: true });
  await db.sale.update({ where: { id: saleIds[1] }, data: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } });
});

describe("empresas en el panel del equipo Teru", () => {
  it("lista cada empresa con su estado, propietario y uso de los últimos 30 días", async () => {
    const { companies, counts } = await getPlatformCompanies(teru);
    const mine = companies.filter((c) => c.slug.startsWith(tag));
    expect(mine.map((c) => c.name)).toEqual(["Apagada", "Recién Creada", "Vende Mucho"]);

    const byName = Object.fromEntries(mine.map((c) => [c.name, c]));
    expect(byName["Apagada"].status).toBe("INACTIVE");
    expect(byName["Recién Creada"]).toMatchObject({
      status: "SETUP_PENDING",
      owner: null,
      activeUsers: 0,
      recentSalesCount: 0,
      lastSaleAt: null,
      lastLoginAt: null,
    });
    expect(byName["Vende Mucho"]).toMatchObject({
      status: "ACTIVE",
      owner: { name: "Olga", email: `olga@${tag}.co`, isActive: true },
      activeUsers: 2,
      // 4 ventas: una anulada y una de hace 40 días no cuentan.
      recentSalesCount: 2,
      lastLoginAt: "01/10/2026 10:00 a. m.",
    });
    expect(byName["Vende Mucho"].recentSalesTotal.replace(/\s/g, " ")).toBe("$ 20.000");
    expect(byName["Vende Mucho"].lastSaleAt).not.toBeNull();
    expect(counts.total).toBeGreaterThanOrEqual(3);
  });

  it("la ficha trae los datos, el equipo por rol y las sucursales", async () => {
    const company = await getPlatformCompany(teru, vende.id);
    expect(company).toMatchObject({
      name: "Vende Mucho",
      taxId: "900.123.456-7",
      currency: "COP",
      branches: 1,
      recentSalesCount: 2,
    });
    expect(company!.setupCompletedAt).not.toBeNull();
    expect(company!.usersByRole).toEqual(
      expect.arrayContaining([
        { role: "OWNER", isActive: true, count: 1 },
        { role: "CASHIER", isActive: true, count: 1 },
        { role: "CASHIER", isActive: false, count: 1 },
      ]),
    );
    // La ficha no expone el detalle de ventas ni la lista del personal.
    expect(Object.keys(company!)).not.toContain("sales");
    expect(Object.keys(company!)).not.toContain("users");

    expect(await getPlatformCompany(teru, nueva.id)).toMatchObject({ status: "SETUP_PENDING", branches: 0 });
    expect(await getPlatformCompany(teru, "no-existe")).toBeNull();
    expect(await getPlatformCompany(teru, "x".repeat(65))).toBeNull();
  });

  it("sin sesión del equipo Teru no responde", async () => {
    await expect(getPlatformCompanies(null as unknown as PlatformSessionDto)).rejects.toThrow();
    await expect(getPlatformCompany({} as PlatformSessionDto, vende.id)).rejects.toThrow();
  });
});
