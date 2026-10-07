import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole, StockUnit } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  createSupply,
  createWarehouse,
  recordStockMovement,
  setSupplyArchived,
} from "@/server/data/inventory";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { getShoppingList, loadShoppingList } from "@/server/services/shopping-list";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("shopping");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let admin: StaffSessionDto;
let cashier: StaffSessionDto;
let otherAdmin: StaffSessionDto;
let mainId: string;
let secondId: string;

function sessionFor(company: Company, userId: string, role: StaffRole, name: string) {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name, email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  } satisfies StaffSessionDto;
}

async function member(company: Company, role: StaffRole, name: string) {
  const user = await createUser({
    companyId: company.id,
    email: `${name.toLowerCase()}-${company.slug}@${tag}.co`,
    role,
    name,
  });
  return sessionFor(company, user.id, role, name);
}

// Insumo con su ideal y, si se indica, carga inicial por bodega.
async function supply(
  name: string,
  fields: { unit?: StockUnit; minStock?: string; idealStock?: string; stock?: Record<string, string> },
) {
  const id = (
    await createSupply(a.id, {
      name,
      unit: fields.unit ?? "KG",
      minStock: fields.minStock ?? null,
      idealStock: fields.idealStock ?? null,
      unitCost: null,
    })
  ).id!;
  for (const [warehouseId, quantity] of Object.entries(fields.stock ?? {})) {
    await recordStockMovement(a.id, {
      warehouseId,
      supplyId: id,
      type: "INITIAL",
      quantity,
      reason: null,
      userId: admin.user.id,
    });
  }
  return id;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Su Arepa");
  b = await createCompany(`${tag}-b`);
  const main = await createMainBranch(a.id);
  mainId = main.warehouseId;
  await createWarehouse(a.id, main.branchId, "Congelador");
  secondId = (await db.warehouse.findFirstOrThrow({ where: { companyId: a.id, isMain: false } })).id;
  await createMainBranch(b.id);

  admin = await member(a, "ADMIN", "Carla");
  cashier = await member(a, "CASHIER", "Ana");
  otherAdmin = await member(b, "ADMIN", "Eva");

  // Suma las dos bodegas: 3 + 2 = 5 de 10.
  await supply("Carne", { idealStock: "10", minStock: "6", stock: { [mainId]: "3", [secondId]: "2" } });
  await supply("Queso", { idealStock: "2", stock: { [mainId]: "2.5" } });
  await supply("Arepas", { unit: "UNIT", idealStock: "50", stock: { [mainId]: "50" } });
  await supply("Sal", { idealStock: "1.5", stock: { [mainId]: "0.25" } });
  await supply("Harina", { stock: { [mainId]: "18.4" } });
  await supply("Huevos", { unit: "UNIT", idealStock: "30" });
  // Saldo negativo (solo pasa por ventas): se fija directo en la prueba.
  const gaseosa = await supply("Gaseosa", { unit: "UNIT", idealStock: "24", stock: { [mainId]: "1" } });
  await db.stockLevel.update({
    where: { warehouseId_supplyId: { warehouseId: mainId, supplyId: gaseosa } },
    data: { quantity: "-3" },
  });
  const archived = await supply("Viejo", { idealStock: "5" });
  await setSupplyArchived(a.id, archived, true);
});
afterAll(() => cleanupCompanies(tag));

describe("lista de compras", () => {
  it("sugiere ideal − existencia de todas las bodegas, con el negativo como 0", async () => {
    const list = await getShoppingList(admin);
    expect(list).toMatchObject({ companyName: "Su Arepa", printedBy: "Carla" });
    expect(list.toBuy.map((s) => [s.name, s.totalStock, s.idealStock, s.toBuy])).toEqual([
      ["Carne", "5", "10", "5"],
      ["Gaseosa", "-3", "24", "24"],
      ["Sal", "0.25", "1.5", "1.25"],
    ]);
    expect(list.toBuy.find((s) => s.name === "Carne")?.belowMinimum).toBe(true);
    expect(list.toBuy.find((s) => s.name === "Gaseosa")?.negativeStock).toBe(true);
  });

  it("separa los que alcanzan (incluido el ideal exacto) y los que no tienen sugerencia", async () => {
    const list = await getShoppingList(admin);
    expect(list.enough.map((s) => [s.name, s.toBuy])).toEqual([
      ["Arepas", null],
      ["Queso", null],
    ]);
    // Sin ideal, o sin carga inicial (la existencia no se conoce). Sin archivados.
    expect(list.noSuggestion.map((s) => [s.name, s.uninitialized, s.toBuy])).toEqual([
      ["Harina", false, null],
      ["Huevos", true, null],
    ]);
  });

  it("el cálculo sin permiso (reporte de cierre) da la misma lista", async () => {
    const { toBuy, enough, noSuggestion } = await getShoppingList(admin);
    expect(await loadShoppingList(a.id)).toEqual({ toBuy, enough, noSuggestion });
  });

  it("no cruza empresas ni la ve quien no maneja el inventario", async () => {
    const other = await getShoppingList(otherAdmin);
    expect([other.toBuy, other.enough, other.noSuggestion]).toEqual([[], [], []]);
    await expect(getShoppingList(cashier)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
