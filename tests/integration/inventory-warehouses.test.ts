import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { createSupply, recordStockMovement } from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createInventoryWarehouse,
  getWarehouses,
  renameInventoryWarehouse,
  setInventoryWarehouseActive,
} from "@/server/services/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("warehouses");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let branchA: string;
let branchB: string;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  branchA = (await createMainBranch(a.id)).branchId;
  branchB = (await createMainBranch(b.id)).branchId;
});
afterAll(() => cleanupCompanies(tag));

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const warehousesOf = async (company: Company) =>
  (await getWarehouses(sessionFor(company, "OWNER"))).groups.flatMap((g) => g.warehouses);
const idOf = async (company: Company, name: string) =>
  (await warehousesOf(company)).find((w) => w.name === name)!.id;

describe("bodegas (servicio)", () => {
  it("lista la principal con sus sucursales disponibles", async () => {
    const { groups, branches } = await getWarehouses(sessionFor(a, "ADMIN"));
    expect(branches.map((branch) => branch.id)).toEqual([branchA]);
    expect(groups).toHaveLength(1);
    expect(groups[0].warehouses).toEqual([
      expect.objectContaining({
        name: "Bodega principal",
        isMain: true,
        stockedSupplies: 0,
        canDeactivate: false,
      }),
    ]);
  });

  it("el administrador crea y renombra, con nombre válido y único", async () => {
    const admin = sessionFor(a, "ADMIN");
    const create = (name: string, branchId = branchA) =>
      createInventoryWarehouse(admin, { branchId, name });

    expect(await create("  Cuarto   frío ")).toEqual({ ok: true });
    expect(await create("cuarto frío")).toEqual({
      ok: false,
      error: "Ya existe una bodega con ese nombre.",
    });
    expect(await create("x")).toEqual({
      ok: false,
      error: "Escribe el nombre (mínimo 2 caracteres).",
    });
    // Sucursal de otra empresa.
    expect(await create("Ajena", branchB)).toEqual({
      ok: false,
      error: "La sucursal ya no está disponible. Actualiza la página.",
    });

    const id = await idOf(a, "Cuarto frío");
    expect(await renameInventoryWarehouse(admin, id, "Despensa")).toEqual({ ok: true });
    expect(await renameInventoryWarehouse(sessionFor(b, "OWNER"), id, "Robada")).toEqual({
      ok: false,
      error: "La bodega ya no existe. Actualiza la página.",
    });
    expect((await warehousesOf(a)).map((w) => w.name)).toEqual(["Bodega principal", "Despensa"]);
  });

  it("no desactiva la principal ni una bodega con existencias", async () => {
    const admin = sessionFor(a, "ADMIN");
    const main = await idOf(a, "Bodega principal");
    const despensa = await idOf(a, "Despensa");

    expect(await setInventoryWarehouseActive(admin, main, false)).toEqual({
      ok: false,
      error: "La bodega principal de una sucursal no se puede desactivar.",
    });

    const user = await createUser({ companyId: a.id, email: `${tag}@prueba.test` });
    const { id: supplyId } = await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null });
    const moveDespensa = (quantity: string, type: "INITIAL" | "ADJUSTMENT") =>
      recordStockMovement(a.id, {
        warehouseId: despensa,
        supplyId: supplyId!,
        type,
        quantity,
        reason: type === "ADJUSTMENT" ? "Conteo" : null,
        userId: user.id,
      });
    await moveDespensa("2", "INITIAL");

    expect((await warehousesOf(a)).find((w) => w.id === despensa)).toMatchObject({
      stockedSupplies: 1,
      canDeactivate: false,
    });
    expect(await setInventoryWarehouseActive(admin, despensa, false)).toEqual({
      ok: false,
      error: "Esta bodega tiene existencias: ajústalas a cero antes de desactivarla.",
    });

    // En cero ya se puede desactivar, y reactivar.
    await moveDespensa("-2", "ADJUSTMENT");
    expect(await setInventoryWarehouseActive(admin, despensa, false)).toEqual({ ok: true });
    expect((await warehousesOf(a)).find((w) => w.id === despensa)).toMatchObject({
      isActive: false,
      canDeactivate: false,
    });
    expect(await setInventoryWarehouseActive(admin, despensa, true)).toEqual({ ok: true });
    expect(await db.warehouse.count({ where: { companyId: a.id, isActive: true } })).toBe(2);
  });

  it("el personal no gestiona bodegas", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(getWarehouses(staff)).rejects.toThrow(ForbiddenError);
    await expect(
      createInventoryWarehouse(staff, { branchId: branchA, name: "Otra" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(setInventoryWarehouseActive(staff, "x", false)).rejects.toThrow(ForbiddenError);
  });
});
