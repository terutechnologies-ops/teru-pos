import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  createSupply,
  createWarehouse,
  recordStockMovement,
  setSupplyArchived,
} from "@/server/data/inventory";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { getStockSheet, getSupplyList } from "@/server/services/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("stocksheet");
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

  const supply = async (name: string, minStock: string | null, quantity?: string) => {
    const id = (await createSupply(a.id, { name, unit: "KG", minStock, idealStock: null, unitCost: null })).id!;
    if (quantity) {
      await recordStockMovement(a.id, {
        warehouseId: mainId,
        supplyId: id,
        type: "INITIAL",
        quantity,
        reason: null,
        userId: admin.user.id,
      });
    }
    return id;
  };
  await supply("Harina", null, "18.4");
  await supply("Mantequilla", "1", "0.4");
  await supply("Servilletas", null);
  const archived = await supply("Viejo", null);
  await setSupplyArchived(a.id, archived, true);
});
afterAll(() => cleanupCompanies(tag));

describe("hoja de existencias", () => {
  it("lista los insumos activos con su saldo en la bodega y la marca de mínimo", async () => {
    const sheet = await getStockSheet(admin, mainId);
    expect(sheet).toMatchObject({
      companyName: "Su Arepa",
      warehouseName: "Bodega principal",
      printedBy: "Carla",
    });
    expect(sheet?.supplies.map((s) => [s.name, s.quantity, s.belowMinimum])).toEqual([
      ["Harina", "18.4", false],
      ["Mantequilla", "0.4", true],
      ["Servilletas", null, false],
    ]);
  });

  it("en otra bodega, lo que no se cargó allí sale sin carga", async () => {
    const sheet = await getStockSheet(admin, secondId);
    expect(sheet?.warehouseName).toBe("Congelador");
    expect(sheet?.supplies.map((s) => s.quantity)).toEqual([null, null, null]);
  });

  it("la lista de insumos trae la bodega principal para imprimir", async () => {
    expect((await getSupplyList(admin, {})).mainWarehouseId).toBe(mainId);
  });

  it("no cruza empresas ni la ve quien no maneja el inventario", async () => {
    expect(await getStockSheet(otherAdmin, mainId)).toBeNull();
    expect(await getStockSheet(admin, "no-existe")).toBeNull();
    await expect(getStockSheet(cashier, mainId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
