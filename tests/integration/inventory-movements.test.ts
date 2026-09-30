import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffRole } from "@/generated/prisma/enums";
import type { StaffSessionDto } from "@/server/dto/auth";
import { createSupply, createWarehouse, setWarehouseActive } from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  getSupplyDetail,
  registerStockMovement,
  setInventorySupplyArchived,
} from "@/server/services/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("movements");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let user: { id: string; name: string };
let mainA: string;
let coldRoom: string;
let northWarehouse: string;
let warehouseB: string;
let harina: string;
let queso: string;
let supplyB: string;

const warehouseIdOf = async (companyId: string, name: string) =>
  (await db.warehouse.findFirstOrThrow({ where: { companyId, name } })).id;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  user = await createUser({
    companyId: a.id,
    email: `${tag}@prueba.test`,
    role: "ADMIN",
    name: "Ana Admin",
  });
  const main = await createMainBranch(a.id);
  mainA = main.warehouseId;
  await createWarehouse(a.id, main.branchId, "Cuarto frío");
  coldRoom = await warehouseIdOf(a.id, "Cuarto frío");
  const north = await db.branch.create({ data: { companyId: a.id, name: "Sede Norte" } });
  await createWarehouse(a.id, north.id, "Despensa Norte");
  northWarehouse = await warehouseIdOf(a.id, "Despensa Norte");
  warehouseB = (await createMainBranch(b.id)).warehouseId;

  harina = (await createSupply(a.id, { name: "Harina", unit: "KG", minStock: null, unitCost: null })).id!;
  queso = (await createSupply(a.id, { name: "Queso", unit: "G", minStock: null, unitCost: null })).id!;
  supplyB = (await createSupply(b.id, { name: "Ajena", unit: "G", minStock: null, unitCost: null })).id!;
});
afterAll(() => cleanupCompanies(tag));

// Los servicios reciben la sesión ya validada; el usuario debe existir
// porque queda en cada movimiento.
function sessionFor(company: Company, role: StaffRole, userId = user.id): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const admin = () => sessionFor(a, "ADMIN");
const register = (
  supplyId: string,
  warehouseId: string,
  input: { kind: string; quantity: string; reason?: string },
) => registerStockMovement(admin(), { supplyId, warehouseId }, { reason: "", ...input });

describe("existencias y movimientos (servicio)", () => {
  it("la ficha agrupa las bodegas activas por sucursal, sin carga inicial", async () => {
    const detail = await getSupplyDetail(admin(), harina);
    expect(detail?.supply).toMatchObject({ name: "Harina", unit: "KG", totalStock: "0" });
    expect(
      detail?.stock.map((group) => [
        group.branch.name,
        group.warehouses.map((w) => [w.name, w.quantity, w.initialized]),
      ]),
    ).toEqual([
      [
        "Sede principal",
        [
          ["Bodega principal", "0", false],
          ["Cuarto frío", "0", false],
        ],
      ],
      ["Sede Norte", [["Despensa Norte", "0", false]]],
    ]);
    expect(detail?.movements).toEqual([]);
    expect(detail?.dateFormat).toBe("DD/MM/YYYY");
    expect(await getSupplyDetail(sessionFor(b, "OWNER", "x"), harina)).toBeNull();
  });

  it("registra la carga inicial una sola vez por bodega", async () => {
    expect(await register(harina, mainA, { kind: "INITIAL", quantity: "10.50" })).toEqual({
      ok: true,
    });
    expect(await register(harina, mainA, { kind: "INITIAL", quantity: "3" })).toEqual({
      ok: false,
      fieldErrors: {},
      error: "Esta bodega ya tiene su carga inicial. Actualiza la página para registrar un ajuste.",
    });

    const detail = await getSupplyDetail(admin(), harina);
    expect(detail?.supply.totalStock).toBe("10.5");
    expect(detail?.stock[0].warehouses[0]).toMatchObject({ quantity: "10.5", initialized: true });
    expect(detail?.movements).toEqual([
      expect.objectContaining({
        kind: "INITIAL",
        quantity: "10.5",
        balanceAfter: "10.5",
        reason: null,
        warehouseName: "Bodega principal",
        userName: "Ana Admin",
      }),
    ]);
  });

  it("los ajustes suben o bajan el saldo y nunca lo dejan negativo", async () => {
    expect(
      await register(harina, mainA, { kind: "OUT", quantity: "20", reason: "Conteo físico" }),
    ).toEqual({
      ok: false,
      fieldErrors: { quantity: "La salida supera la existencia de la bodega (hay 10,5 kg)." },
    });
    expect(
      await register(harina, mainA, { kind: "OUT", quantity: "2.5", reason: "Producto dañado" }),
    ).toEqual({ ok: true });
    expect(await register(harina, mainA, { kind: "IN", quantity: "1", reason: "Conteo" })).toEqual({
      ok: true,
    });
    expect(await register(harina, coldRoom, { kind: "INITIAL", quantity: "4" })).toEqual({
      ok: true,
    });

    const detail = await getSupplyDetail(admin(), harina);
    expect(detail?.supply.totalStock).toBe("13");
    // Del más reciente al más antiguo; cantidades sin signo.
    expect(
      detail?.movements.map((m) => [m.warehouseName, m.kind, m.quantity, m.balanceAfter, m.reason]),
    ).toEqual([
      ["Cuarto frío", "INITIAL", "4", "4", null],
      ["Bodega principal", "IN", "1", "9", "Conteo"],
      ["Bodega principal", "OUT", "2.5", "8", "Producto dañado"],
      ["Bodega principal", "INITIAL", "10.5", "10.5", null],
    ]);

    const filtered = await getSupplyDetail(admin(), harina, { warehouseId: coldRoom });
    expect(filtered?.movements.map((m) => m.warehouseName)).toEqual(["Cuarto frío"]);
    const foreign = await getSupplyDetail(admin(), harina, { warehouseId: warehouseB });
    expect(foreign?.movements).toEqual([]);
  });

  it("valida los datos antes de registrar", async () => {
    expect(await register(queso, mainA, { kind: "IN", quantity: "0", reason: "" })).toEqual({
      ok: false,
      fieldErrors: {
        quantity: "La cantidad debe ser mayor que cero.",
        reason: "Escribe el motivo del ajuste (mínimo 3 caracteres).",
      },
    });
    expect(await db.stockMovement.count({ where: { supplyId: queso } })).toBe(0);
  });

  it("rechaza bodegas inactivas o ajenas, insumos archivados o ajenos", async () => {
    await setWarehouseActive(a.id, northWarehouse, false);
    expect(await register(queso, northWarehouse, { kind: "INITIAL", quantity: "5" })).toEqual({
      ok: false,
      fieldErrors: {},
      error: "La bodega está inactiva: actívala para registrar movimientos.",
    });
    const detail = await getSupplyDetail(admin(), queso);
    expect(detail?.stock.map((group) => group.branch.name)).toEqual(["Sede principal"]);
    expect(detail?.warehouseOptions.find((w) => w.id === northWarehouse)).toMatchObject({
      isActive: false,
    });

    expect(await register(queso, warehouseB, { kind: "INITIAL", quantity: "5" })).toMatchObject({
      error: "La bodega ya no existe. Actualiza la página.",
    });
    expect(await register(supplyB, mainA, { kind: "INITIAL", quantity: "5" })).toMatchObject({
      error: "El insumo ya no existe. Actualiza la página.",
    });

    expect(await setInventorySupplyArchived(admin(), queso, true)).toEqual({ ok: true });
    expect(await register(queso, mainA, { kind: "INITIAL", quantity: "5" })).toMatchObject({
      error: "El insumo está archivado: restáuralo para registrar movimientos.",
    });
  });

  it("el personal no ve ni registra movimientos", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(getSupplyDetail(staff, harina)).rejects.toThrow(ForbiddenError);
    await expect(
      registerStockMovement(
        staff,
        { supplyId: harina, warehouseId: mainA },
        { kind: "IN", quantity: "1", reason: "Conteo" },
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});
