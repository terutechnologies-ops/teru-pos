import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createProduct, createProductCategory } from "@/server/data/catalog";
import { createSupply, recordStockMovement } from "@/server/data/inventory";
import { addRecipeItem } from "@/server/data/recipes";
import type { StaffSessionDto } from "@/server/dto/auth";
import { getPendingAlerts } from "@/server/services/alerts";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { getProductAlertCounts, getProductCatalog } from "@/server/services/catalog";
import { getSupplyAlertCounts, getSupplyList } from "@/server/services/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("alerts");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;

function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

const ownerA = () => sessionFor(a, "OWNER");

async function supply(
  company: Company,
  name: string,
  fields: { minStock?: string; unitCost?: string; archived?: boolean } = {},
) {
  const id = (
    await createSupply(company.id, {
      name,
      unit: "KG",
      minStock: fields.minStock ?? null,
      unitCost: fields.unitCost ?? null,
    })
  ).id!;
  if (fields.archived) await db.supply.update({ where: { id }, data: { isArchived: true } });
  return id;
}

async function product(company: Company, categoryId: string, name: string, archived = false) {
  const id = (await createProduct(company.id, { categoryId, name, description: null, price: "1000" }))
    .id!;
  if (archived) await db.product.update({ where: { id }, data: { isArchived: true } });
  return id;
}

async function category(company: Company) {
  await createProductCategory(company.id, "General");
  return (await db.productCategory.findFirstOrThrow({ where: { companyId: company.id } })).id;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  const { warehouseId } = await createMainBranch(a.id);
  const userId = (await createUser({ companyId: a.id, email: `${tag}@prueba.test` })).id;
  const load = (supplyId: string, quantity: string) =>
    recordStockMovement(a.id, {
      warehouseId,
      supplyId,
      type: "INITIAL",
      quantity,
      reason: null,
      userId,
    });

  // Insumos de A: uno por alerta, uno sin pendientes y uno archivado.
  const harina = await supply(a, "Harina", { minStock: "10" });
  await load(harina, "2");
  const queso = await supply(a, "Queso", { unitCost: "20000" });
  await load(queso, "1");
  // Como lo deja una venta que consume más de lo registrado.
  await db.stockLevel.update({
    where: { warehouseId_supplyId: { warehouseId, supplyId: queso } },
    data: { quantity: "-2" },
  });
  // Sin carga: aunque tenga mínimo, no se marca bajo mínimo.
  await supply(a, "Sal", { minStock: "1" });
  const azucar = await supply(a, "Azúcar", { minStock: "5", unitCost: "4000" });
  await load(azucar, "20");
  await supply(a, "Viejo", { archived: true });

  // Productos de A: sin receta, costo incompleto, completo y archivado.
  const general = await category(a);
  await product(a, general, "Jugo");
  const arepa = await product(a, general, "Arepa");
  await addRecipeItem(a.id, arepa, harina, { quantity: "120", unit: "G" });
  const pan = await product(a, general, "Pan");
  await addRecipeItem(a.id, pan, azucar, { quantity: "10", unit: "G" });
  await product(a, general, "Archivado", true);

  // B: sus propios pendientes, que no se cuentan en A.
  await product(b, await category(b), "Otro");
  await supply(b, "Otro insumo");
});
afterAll(() => cleanupCompanies(tag));

describe("pendientes del inicio", () => {
  it("cuenta cada alerta sin archivados ni datos de otra empresa", async () => {
    expect(await getPendingAlerts(ownerA())).toEqual({
      products: { "sin-receta": 1, "costo-incompleto": 1 },
      supplies: { "saldo-negativo": 1, "sin-carga": 1, "bajo-minimo": 1 },
    });
    expect(await getPendingAlerts(sessionFor(b, "ADMIN"))).toEqual({
      products: { "sin-receta": 1, "costo-incompleto": 0 },
      supplies: { "saldo-negativo": 0, "sin-carga": 1, "bajo-minimo": 0 },
    });
  });

  it("sin permisos de catálogo ni inventario no hay tarjeta", async () => {
    for (const role of ["STAFF", "CASHIER"] as const) {
      expect(await getPendingAlerts(sessionFor(a, role))).toEqual({
        products: null,
        supplies: null,
      });
    }
    await expect(getProductAlertCounts(sessionFor(a, "CASHIER"))).rejects.toThrow(ForbiddenError);
    await expect(getSupplyAlertCounts(sessionFor(a, "STAFF"))).rejects.toThrow(ForbiddenError);
  });
});

describe("listas filtradas por alerta", () => {
  const supplyNames = async (filters: Parameters<typeof getSupplyList>[1]) =>
    (await getSupplyList(ownerA(), filters)).supplies.map((s) => s.name);
  const productNames = async (filters: Parameters<typeof getProductCatalog>[1]) =>
    (await getProductCatalog(ownerA(), filters)).products.map((p) => p.name);

  it("insumos: cada alerta con su insignia", async () => {
    expect(await supplyNames({ alert: "saldo-negativo" })).toEqual(["Queso"]);
    expect(await supplyNames({ alert: "sin-carga" })).toEqual(["Sal"]);
    expect(await supplyNames({ alert: "bajo-minimo" })).toEqual(["Harina"]);
    expect(await supplyNames({ alert: "sin-carga", search: "har" })).toEqual([]);
    // En archivados la alerta no aplica.
    expect(await supplyNames({ alert: "sin-carga", archived: true })).toEqual(["Viejo"]);

    const { supplies } = await getSupplyList(ownerA(), {});
    expect(
      supplies.map((s) => [s.name, s.negativeStock, s.uninitialized, s.belowMinimum]),
    ).toEqual([
      ["Azúcar", false, false, false],
      ["Harina", false, false, true],
      ["Queso", true, false, false],
      ["Sal", false, true, false],
    ]);
  });

  it("productos: sin receta y costo incompleto", async () => {
    expect(await productNames({ alert: "sin-receta" })).toEqual(["Jugo"]);
    expect(await productNames({ alert: "costo-incompleto" })).toEqual(["Arepa"]);
    expect(await productNames({ alert: "sin-receta", archived: true })).toEqual(["Archivado"]);
    expect(await productNames({})).toEqual(["Arepa", "Jugo", "Pan"]);
  });
});
