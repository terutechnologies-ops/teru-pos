import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createCompanyWithOwnerInvitation } from "@/server/data/companies";
import {
  createMainWarehouse,
  createSupply,
  createWarehouse,
  findSupply,
  listStockMovements,
  listSupplies,
  listWarehouses,
  recordStockMovement,
  renameWarehouse,
  setSupplyArchived,
  setWarehouseActive,
  updateSupply,
} from "@/server/data/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("inventory");
let a: { id: string };
let b: { id: string };
let user: { id: string };
let mainA: string;
let mainB: string;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  user = await createUser({ companyId: a.id, email: `${tag}@prueba.test`, role: "ADMIN" });
  mainA = (await createMainBranch(a.id)).warehouseId;
  mainB = (await createMainBranch(b.id)).warehouseId;
});
afterAll(() => cleanupCompanies(tag));

const supplyId = async (companyId: string, name: string) =>
  (await db.supply.findFirstOrThrow({ where: { companyId, name } })).id;
const warehouseId = async (companyId: string, name: string) =>
  (await db.warehouse.findFirstOrThrow({ where: { companyId, name } })).id;

const move = (
  supply: string,
  quantity: string,
  extra: { type?: "INITIAL" | "ADJUSTMENT"; warehouseId?: string } = {},
) =>
  recordStockMovement(a.id, {
    warehouseId: extra.warehouseId ?? mainA,
    supplyId: supply,
    type: extra.type ?? "ADJUSTMENT",
    quantity,
    reason: extra.type === "INITIAL" ? null : "Conteo",
    userId: user.id,
  });

const balanceOf = (result: Awaited<ReturnType<typeof move>>) =>
  result.status === "OK" ? result.balance.toString() : result.status;

describe("bodegas", () => {
  it("el alta de una empresa crea su bodega principal", async () => {
    const { companyId } = await createCompanyWithOwnerInvitation({
      name: "Alta",
      slug: `${tag}-alta`,
      owner: { name: "Dueña", email: `${tag}-alta@prueba.test` },
      tokenHash: `${tag}-hash`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(
      (await listWarehouses(companyId)).map((w) => [w.name, w.isMain, w.branch.isMain]),
    ).toEqual([["Bodega principal", true, true]]);
  });

  it("se crean en una sucursal propia, con nombre único y una sola principal", async () => {
    const branchA = (await db.branch.findFirstOrThrow({ where: { companyId: a.id } })).id;
    const branchB = (await db.branch.findFirstOrThrow({ where: { companyId: b.id } })).id;

    expect(await createWarehouse(a.id, branchA, "Congelador")).toBe("OK");
    expect(await createWarehouse(a.id, branchA, "CONGELADOR")).toBe("NAME_TAKEN");
    // La FK compuesta impide usar una sucursal de otra empresa.
    expect(await createWarehouse(a.id, branchB, "Ajena")).toBe("BRANCH_NOT_FOUND");
    // Índice parcial: una sola bodega principal por sucursal.
    await expect(
      db.$transaction((tx) => createMainWarehouse(tx, a.id, branchA)),
    ).rejects.toThrow();

    expect((await listWarehouses(a.id)).map((w) => w.name)).toEqual([
      "Bodega principal",
      "Congelador",
    ]);
    expect(await listWarehouses(b.id)).toHaveLength(1);
  });

  it("se renombran y desactivan solo dentro de su empresa", async () => {
    const congelador = await warehouseId(a.id, "Congelador");
    expect(await renameWarehouse(b.id, congelador, "Otro")).toBe("NOT_FOUND");
    expect(await renameWarehouse(a.id, congelador, "bodega PRINCIPAL")).toBe("NAME_TAKEN");
    expect(await renameWarehouse(a.id, congelador, "Nevera")).toBe("OK");
    expect(await setWarehouseActive(b.id, congelador, false)).toBe("NOT_FOUND");
    expect(await setWarehouseActive(a.id, mainA, false)).toBe("IS_MAIN");
    expect(await setWarehouseActive(a.id, congelador, false)).toBe("OK");
  });
});

describe("insumos", () => {
  it("se crean con nombre único por empresa y se listan", async () => {
    const harina = { name: "Harina", unit: "KG", minStock: "5" } as const;
    expect((await createSupply(a.id, harina)).status).toBe("OK");
    expect((await createSupply(a.id, { name: "Queso", unit: "G", minStock: null })).status).toBe("OK");
    expect((await createSupply(a.id, { ...harina, name: "HARINA" })).status).toBe("NAME_TAKEN");
    expect((await createSupply(b.id, harina)).status).toBe("OK");
    await expect(
      createSupply(a.id, { name: "Mínimo", unit: "G", minStock: "-1" }),
    ).rejects.toThrow();

    expect((await listSupplies(a.id)).map((s) => s.name)).toEqual(["Harina", "Queso"]);
    expect((await listSupplies(a.id, { search: "que" })).map((s) => s.name)).toEqual(["Queso"]);
    const found = await findSupply(a.id, await supplyId(a.id, "Harina"));
    expect(found?.minStock?.toString()).toBe("5");
    expect(await findSupply(b.id, found!.id)).toBeNull();
  });

  it("la unidad solo cambia mientras no haya movimientos", async () => {
    const queso = await supplyId(a.id, "Queso");
    const data = { name: "Queso", unit: "KG", minStock: "2" } as const;
    expect(await updateSupply(b.id, queso, data)).toBe("NOT_FOUND");
    expect(await updateSupply(a.id, queso, { ...data, name: "harina" })).toBe("NAME_TAKEN");
    expect(await updateSupply(a.id, queso, data)).toBe("OK");

    expect((await move(queso, "3", { type: "INITIAL" })).status).toBe("OK");
    expect(await updateSupply(a.id, queso, { ...data, unit: "G" })).toBe("UNIT_LOCKED");
    // Sin cambiar la unidad, el resto sí se edita.
    expect(await updateSupply(a.id, queso, { ...data, name: "Queso duro", minStock: null })).toBe(
      "OK",
    );
  });
});

describe("movimientos", () => {
  it("la carga inicial actualiza el saldo y solo se hace una vez por bodega", async () => {
    const harina = await supplyId(a.id, "Harina");
    expect(balanceOf(await move(harina, "10.5", { type: "INITIAL" }))).toBe("10.5");
    expect(balanceOf(await move(harina, "1", { type: "INITIAL" }))).toBe("ALREADY_INITIALIZED");
  });

  it("los ajustes suman y restan, sin dejar el saldo negativo", async () => {
    const harina = await supplyId(a.id, "Harina");
    expect(balanceOf(await move(harina, "-0.5"))).toBe("10");
    expect(balanceOf(await move(harina, "-10.001"))).toBe("INSUFFICIENT_STOCK");
    expect(balanceOf(await move(harina, "-10"))).toBe("0");
    expect(balanceOf(await move(harina, "2.25"))).toBe("2.25");

    const levels = (await findSupply(a.id, harina))?.stockLevels;
    expect(levels?.map((l) => [l.warehouseId, l.quantity.toString()])).toEqual([[mainA, "2.25"]]);
  });

  it("rechaza bodegas inactivas o ajenas e insumos archivados o ajenos", async () => {
    const harina = await supplyId(a.id, "Harina");
    const nevera = await warehouseId(a.id, "Nevera");
    const harinaB = await supplyId(b.id, "Harina");

    expect(balanceOf(await move(harina, "1", { warehouseId: nevera }))).toBe("WAREHOUSE_INACTIVE");
    expect(balanceOf(await move(harina, "1", { warehouseId: mainB }))).toBe("WAREHOUSE_NOT_FOUND");
    expect(balanceOf(await move(harinaB, "1"))).toBe("SUPPLY_NOT_FOUND");

    const queso = await supplyId(a.id, "Queso duro");
    expect(await setSupplyArchived(b.id, queso, true)).toBe("NOT_FOUND");
    expect(await setSupplyArchived(a.id, queso, true)).toBe("HAS_STOCK");
    expect(balanceOf(await move(queso, "-3"))).toBe("0");
    expect(await setSupplyArchived(a.id, queso, true)).toBe("OK");
    expect(balanceOf(await move(queso, "1"))).toBe("SUPPLY_ARCHIVED");
    expect(await listSupplies(a.id, { archived: true })).toHaveLength(1);
  });

  it("dos salidas simultáneas no dejan el saldo negativo", async () => {
    const harina = await supplyId(a.id, "Harina");
    // Saldo 2.25: solo una de las dos salidas de 2 puede pasar.
    const results = await Promise.all([move(harina, "-2"), move(harina, "-2")]);
    expect(results.map(balanceOf).sort()).toEqual(["0.25", "INSUFFICIENT_STOCK"]);
    const level = await db.stockLevel.findUniqueOrThrow({
      where: { warehouseId_supplyId: { warehouseId: mainA, supplyId: harina } },
    });
    expect(level.quantity.toString()).toBe("0.25");
  });

  it("el kardex lista los movimientos del insumo, del más reciente al más antiguo", async () => {
    const harina = await supplyId(a.id, "Harina");
    const kardex = await listStockMovements(a.id, harina);
    expect(
      kardex.map((m) => [m.type, m.quantity.toString(), m.balanceAfter.toString()]),
    ).toEqual([
      ["ADJUSTMENT", "-2", "0.25"],
      ["ADJUSTMENT", "2.25", "2.25"],
      ["ADJUSTMENT", "-10", "0"],
      ["ADJUSTMENT", "-0.5", "10"],
      ["INITIAL", "10.5", "10.5"],
    ]);
    expect(kardex[0]).toMatchObject({ warehouse: { id: mainA }, user: { id: user.id } });
    expect(await listStockMovements(b.id, harina)).toEqual([]);
  });
});
