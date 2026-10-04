import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { openCashSession } from "@/server/data/cash-sessions";
import {
  createSupply,
  createWarehouse,
  recordStockMovement,
  setSupplyArchived,
  setWarehouseActive,
} from "@/server/data/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  confirmCount,
  deleteCount,
  getCount,
  getCountDrafts,
  getCountStartOptions,
  saveCount,
  startCount,
  type CountFormEntry,
} from "@/server/services/inventory-counts";
import { countedQuantitySchema } from "@/server/validations/inventory-counts";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("counts");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let userA: string;
let userB: string;
let mainA: string;
let branchA: string;
let mainB: string;
let harina: string;
let queso: string;
let sal: string;

function sessionFor(company: Company, userId: string, role: StaffRole = "ADMIN"): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const admin = () => sessionFor(a, userA);

async function supply(name: string, unit: "KG" | "G" | "UNIT", initial?: string) {
  const { id } = await createSupply(a.id, { name, unit, minStock: null, unitCost: null });
  if (!id) throw new Error(name);
  if (initial) {
    await recordStockMovement(a.id, {
      warehouseId: mainA,
      supplyId: id,
      type: "INITIAL",
      quantity: initial,
      reason: null,
      userId: userA,
    });
  }
  return id;
}

async function start(warehouseId = mainA) {
  const result = await startCount(admin(), warehouseId);
  if (!result.ok) throw new Error(result.error);
  return result.countId;
}

// Lo que enviaría el formulario: insumo, lo escrito y la unidad mostrada.
const entry = (supplyId: string, counted: string, unit = "KG"): CountFormEntry => ({
  supplyId,
  counted,
  unit,
});

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Empresa A");
  b = await createCompany(`${tag}-b`, "Empresa B");
  const main = await createMainBranch(a.id);
  mainA = main.warehouseId;
  branchA = main.branchId;
  mainB = (await createMainBranch(b.id)).warehouseId;
  userA = (await createUser({ companyId: a.id, email: `admin@${tag}-a.co`, role: "ADMIN" })).id;
  userB = (await createUser({ companyId: b.id, email: `admin@${tag}-b.co`, role: "ADMIN" })).id;
  harina = await supply("Harina", "KG", "10");
  queso = await supply("Queso", "KG");
  sal = await supply("Sal", "G");
});
afterAll(() => cleanupCompanies(tag));

describe("lo contado", () => {
  it("acepta coma decimal y cero; vacío no se cuenta", () => {
    expect(countedQuantitySchema.parse("2,5")).toBe("2.5");
    expect(countedQuantitySchema.parse(" 0 ")).toBe("0");
    expect(countedQuantitySchema.parse("")).toBeNull();
    expect(countedQuantitySchema.safeParse("-1").success).toBe(false);
    expect(countedQuantitySchema.safeParse("1,2345").success).toBe(false);
  });
});

describe("conteos", () => {
  it("empieza o retoma el borrador de la bodega", async () => {
    const countId = await start();
    expect(await startCount(admin(), mainA)).toEqual({ ok: true, countId });
    expect(await startCount(admin(), mainB)).toEqual({ ok: false, error: "Elige una bodega." });

    await createWarehouse(a.id, branchA, "Inactiva");
    const inactive = (await db.warehouse.findFirstOrThrow({ where: { companyId: a.id, name: "Inactiva" } })).id;
    await setWarehouseActive(a.id, inactive, false);
    const refused = await startCount(admin(), inactive);
    expect(refused.ok).toBe(false);

    const options = await getCountStartOptions(admin());
    expect(options.warehouses.map((w) => w.id)).toEqual([mainA]);
    const drafts = await getCountDrafts(admin());
    expect(drafts).toMatchObject([{ id: countId, countedCount: 0 }]);
    await deleteCount(admin(), countId);
  });

  it("el borrador lista los insumos activos con su saldo y lo contado", async () => {
    const countId = await start();
    expect(await saveCount(admin(), countId, [entry(harina, "9,5"), entry(queso, "")])).toEqual({
      ok: true,
    });
    const count = await getCount(admin(), countId);
    expect(count?.draft?.rows.map((row) => [row.name, row.system, row.counted])).toEqual([
      ["Harina", "10", "9,5"],
      ["Queso", null, ""],
      ["Sal", null, ""],
    ]);
    expect(count?.draft?.countedCount).toBe(1);
    expect(count?.draft?.openShifts).toBe(0);
    await deleteCount(admin(), countId);
  });

  it("no guarda nada si alguna cantidad no es válida", async () => {
    const countId = await start();
    const result = await saveCount(admin(), countId, [entry(harina, "8"), entry(queso, "-2")]);
    expect(result).toMatchObject({ ok: false, fieldErrors: { [queso]: expect.any(String) } });
    expect(await db.inventoryCountLine.count({ where: { countId } })).toBe(0);

    // La unidad que se mostró ya no es la del insumo.
    expect(await saveCount(admin(), countId, [entry(sal, "5", "KG")])).toEqual({
      ok: false,
      error: "La unidad de Sal cambió a g: revisa lo contado.",
      fieldErrors: { [sal]: "Ahora se mide en g." },
    });
    await deleteCount(admin(), countId);
  });

  it("confirmar guarda lo escrito y deja el conteo en solo lectura", async () => {
    const countId = await start();
    await saveCount(admin(), countId, [entry(harina, "7")]);
    // Lo escrito después de guardar también entra al confirmar.
    const result = await confirmCount(admin(), countId, [entry(harina, "9"), entry(sal, "500", "G")]);
    expect(result).toMatchObject({ ok: true });

    const count = await getCount(admin(), countId);
    expect(count?.status).toBe("CONFIRMED");
    expect(count?.draft).toBeNull();
    expect(count?.lines.map((line) => [line.name, line.system, line.counted, line.difference])).toEqual([
      ["Harina", "10", "9", "-1"],
      ["Sal", "0", "500", "500"],
    ]);
    expect(await saveCount(admin(), countId, [entry(harina, "1")])).toMatchObject({ ok: false });
    expect(await deleteCount(admin(), countId)).toMatchObject({ ok: false });
  });

  it("explica lo que impide confirmar", async () => {
    const countId = await start();
    expect(await confirmCount(admin(), countId, [entry(harina, "")])).toEqual({
      ok: false,
      error: "Escribe lo contado de al menos un insumo para confirmar.",
      fieldErrors: {},
    });

    const pimienta = await supply("Pimienta", "KG");
    await saveCount(admin(), countId, [entry(pimienta, "1")]);
    await setSupplyArchived(a.id, pimienta, true);
    // El archivado aparece en el borrador para dejarlo en blanco.
    const count = await getCount(admin(), countId);
    expect(count?.draft?.rows.find((row) => row.supplyId === pimienta)).toMatchObject({
      archived: true,
      counted: "1",
    });
    expect(await confirmCount(admin(), countId, [entry(harina, "9")])).toEqual({
      ok: false,
      error: "Pimienta está archivado: déjalo en blanco o restáuralo para contarlo.",
      fieldErrors: { [pimienta]: "Archivado: déjalo en blanco." },
    });
    // En blanco se puede confirmar.
    expect(
      await confirmCount(admin(), countId, [entry(harina, "9"), entry(pimienta, "")]),
    ).toMatchObject({ ok: true });
  });

  it("avisa los turnos de caja abiertos en la sucursal", async () => {
    await openCashSession(a.id, { userId: userA, branchId: branchA, openingAmount: "0" });
    const countId = await start();
    expect((await getCount(admin(), countId))?.draft?.openShifts).toBe(1);
    await deleteCount(admin(), countId);
  });
});

describe("aislamiento y permisos", () => {
  it("otra empresa no ve ni cambia el conteo", async () => {
    const countId = await start();
    const other = sessionFor(b, userB);
    expect(await getCount(other, countId)).toBeNull();
    expect(await saveCount(other, countId, [])).toMatchObject({ ok: false });
    expect(await confirmCount(other, countId, [])).toMatchObject({ ok: false });
    expect(await deleteCount(other, countId)).toMatchObject({ ok: false });
    expect(await getCountDrafts(other)).toEqual([]);
    await deleteCount(admin(), countId);
  });

  it("personal y cajeros no cuentan", async () => {
    for (const role of ["STAFF", "CASHIER"] as const) {
      const session = sessionFor(a, userA, role);
      await expect(getCountDrafts(session)).rejects.toThrow(ForbiddenError);
      await expect(startCount(session, mainA)).rejects.toThrow(ForbiddenError);
      await expect(saveCount(session, "x", [])).rejects.toThrow(ForbiddenError);
      await expect(confirmCount(session, "x", [])).rejects.toThrow(ForbiddenError);
    }
  });
});
