import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import type { StaffSessionDto } from "@/server/dto/auth";
import { recordStockMovement } from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createInventorySupply,
  getSupply,
  getSupplyList,
  setInventorySupplyArchived,
  updateInventorySupply,
} from "@/server/services/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("supplies");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let warehouseA: string;
let userId: string;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  warehouseA = (await createMainBranch(a.id)).warehouseId;
  userId = (await createUser({ companyId: a.id, email: `${tag}@prueba.test` })).id;
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

const admin = () => sessionFor(a, "ADMIN");
const idOf = async (name: string) =>
  (await getSupplyList(admin(), {})).find((s) => s.name === name)!.id;
const move = (supplyId: string, quantity: string, type: "INITIAL" | "ADJUSTMENT" = "ADJUSTMENT") =>
  recordStockMovement(a.id, {
    warehouseId: warehouseA,
    supplyId,
    type,
    quantity,
    reason: type === "ADJUSTMENT" ? "Conteo" : null,
    userId,
  });

describe("insumos (servicio)", () => {
  it("el administrador crea insumos con validación y nombre único", async () => {
    expect(
      await createInventorySupply(admin(), { name: " Harina ", unit: "KG", minStock: "5" }),
    ).toMatchObject({ ok: true });
    expect(
      await createInventorySupply(admin(), { name: "Gaseosa", unit: "UNIT", minStock: "" }),
    ).toMatchObject({ ok: true });
    expect(
      await createInventorySupply(admin(), { name: "harina", unit: "G", minStock: "" }),
    ).toEqual({ ok: false, fieldErrors: { name: "Ya existe un insumo con ese nombre." } });
    expect(await createInventorySupply(admin(), { name: "X", unit: "", minStock: "1,5" })).toEqual({
      ok: false,
      fieldErrors: {
        name: "Escribe el nombre (mínimo 2 caracteres).",
        unit: "Elige una unidad.",
        minStock: "Escribe una cantidad válida (solo números, sin signos).",
      },
    });
  });

  it("lista con existencia total y marca los que están bajo el mínimo", async () => {
    const harina = await idOf("Harina");
    expect((await getSupplyList(admin(), {})).map((s) => [s.name, s.totalStock, s.belowMinimum])).toEqual([
      ["Gaseosa", "0", false],
      ["Harina", "0", true],
    ]);

    await move(harina, "7.25", "INITIAL");
    const list = await getSupplyList(admin(), { search: "HAR" });
    expect(list).toEqual([
      expect.objectContaining({
        name: "Harina",
        unit: "KG",
        minStock: "5",
        totalStock: "7.25",
        belowMinimum: false,
      }),
    ]);
    expect(await getSupplyList(sessionFor(b, "OWNER"), {})).toEqual([]);
  });

  it("edita; la unidad queda fija cuando hay movimientos", async () => {
    const harina = await idOf("Harina");
    const gaseosa = await idOf("Gaseosa");

    expect(await getSupply(admin(), harina)).toMatchObject({ unitLocked: true });
    expect(await getSupply(admin(), gaseosa)).toMatchObject({ unitLocked: false });
    expect(await getSupply(sessionFor(b, "OWNER"), harina)).toBeNull();

    expect(
      await updateInventorySupply(admin(), harina, { name: "Harina", unit: "G", minStock: "5" }),
    ).toEqual({
      ok: false,
      fieldErrors: { unit: "La unidad no se puede cambiar: el insumo ya tiene movimientos." },
    });
    expect(
      await updateInventorySupply(admin(), harina, { name: "Harina PAN", unit: "KG", minStock: "10" }),
    ).toEqual({ ok: true, supplyId: harina });
    expect(await getSupply(admin(), harina)).toMatchObject({
      name: "Harina PAN",
      minStock: "10",
      belowMinimum: true,
    });

    expect(
      await updateInventorySupply(admin(), gaseosa, { name: "Gaseosa", unit: "L", minStock: "" }),
    ).toEqual({ ok: true, supplyId: gaseosa });
    expect(
      await updateInventorySupply(sessionFor(b, "OWNER"), gaseosa, {
        name: "Robada",
        unit: "L",
        minStock: "",
      }),
    ).toEqual({ ok: false, fieldErrors: {}, error: "El insumo ya no existe. Actualiza la página." });
  });

  it("no archiva con existencias; en cero sí, y se restaura", async () => {
    const harina = await idOf("Harina PAN");
    expect(await setInventorySupplyArchived(admin(), harina, true)).toEqual({
      ok: false,
      error: "Este insumo tiene existencias: ajústalas a cero antes de archivarlo.",
    });
    await move(harina, "-7.25");
    expect(await setInventorySupplyArchived(admin(), harina, true)).toEqual({ ok: true });
    expect((await getSupplyList(admin(), {})).map((s) => s.name)).toEqual(["Gaseosa"]);
    expect((await getSupplyList(admin(), { archived: true })).map((s) => s.name)).toEqual([
      "Harina PAN",
    ]);
    expect(await setInventorySupplyArchived(admin(), harina, false)).toEqual({ ok: true });
  });

  it("el personal no gestiona insumos", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(getSupplyList(staff, {})).rejects.toThrow(ForbiddenError);
    await expect(
      createInventorySupply(staff, { name: "Otra", unit: "G", minStock: "" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(setInventorySupplyArchived(staff, "x", true)).rejects.toThrow(ForbiddenError);
  });
});
