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
import { getSupplyDetail } from "@/server/services/inventory";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  confirmCount,
  deleteCount,
  findCountByNumber,
  getCount,
  getCountDrafts,
  getCountsOverview,
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

describe("confirmados", () => {
  let arroz: string;
  let aceite: string;
  let countId: string;
  let number: number;

  beforeAll(async () => {
    arroz = (await createSupply(a.id, { name: "Arroz", unit: "KG", minStock: null, unitCost: "2000" })).id!;
    aceite = (await createSupply(a.id, { name: "Aceite", unit: "KG", minStock: null, unitCost: null })).id!;
    for (const [supplyId, quantity] of [[arroz, "10"], [aceite, "5"]]) {
      await recordStockMovement(a.id, {
        warehouseId: mainA,
        supplyId,
        type: "INITIAL",
        quantity,
        reason: null,
        userId: userA,
      });
    }
    countId = await start();
    // Falta 1 kg de arroz ($ 2.000) y sobra 1 kg de aceite (sin costo).
    const result = await confirmCount(admin(), countId, [entry(arroz, "9"), entry(aceite, "6")]);
    if (!result.ok) throw new Error(result.error);
    number = result.number;
  });

  it("la lista trae los del rango con lo que suma cada uno", async () => {
    await createWarehouse(a.id, branchA, "Cocina");
    const cocina = (await db.warehouse.findFirstOrThrow({ where: { companyId: a.id, name: "Cocina" } })).id;
    const draft = await start(cocina);

    const overview = await getCountsOverview(admin(), {});
    expect(overview.counts.find((count) => count.id === countId)).toMatchObject({
      number,
      warehouseName: (await db.warehouse.findUniqueOrThrow({ where: { id: mainA } })).name,
      lineCount: 2,
      changedCount: 2,
      netValue: "-2000",
      missingCostCount: 1,
    });
    // Los borradores no se listan; con varias bodegas se puede filtrar.
    expect(overview.counts.some((count) => count.id === draft)).toBe(false);
    expect(overview.warehouses.map((warehouse) => warehouse.id)).toContain(cocina);
    expect((await getCountsOverview(admin(), { bodega: cocina })).counts).toEqual([]);
    expect(
      (await getCountsOverview(admin(), { desde: "2020-01-01", hasta: "2020-01-31" })).counts,
    ).toEqual([]);
    expect(overview.filters.to).toBe(overview.today);
    expect(overview.totalCount).toBe(overview.counts.length);
    await deleteCount(admin(), draft);
  });

  it("el detalle trae el resultado por insumo y los totales", async () => {
    const count = await getCount(admin(), countId);
    expect(count?.lines.find((line) => line.supplyId === arroz)).toMatchObject({
      start: "0",
      hasPrevious: false,
      adjusted: "10",
      sold: "0",
      realConsumption: "1",
      differencePercent: null,
      value: "-2000",
    });
    expect(count?.lines.find((line) => line.supplyId === aceite)).toMatchObject({
      difference: "1",
      value: null,
    });
    expect(count?.totals).toEqual({ shortage: "-2000", surplus: "0", net: "-2000", missingCost: 1 });

    // El siguiente conteo empieza en lo contado.
    const next = await start();
    const result = await confirmCount(admin(), next, [entry(arroz, "9")]);
    expect(result.ok).toBe(true);
    expect((await getCount(admin(), next))?.lines[0]).toMatchObject({
      start: "9",
      hasPrevious: true,
      difference: "0",
    });
  });

  it("se busca por número y el kardex lo enlaza", async () => {
    expect(await findCountByNumber(admin(), String(number))).toBe(countId);
    expect(await findCountByNumber(admin(), `#${number}`)).toBe(countId);
    expect(await findCountByNumber(admin(), "abc")).toBeNull();
    expect(await findCountByNumber(admin(), "999999")).toBeNull();
    expect(await findCountByNumber(sessionFor(b, userB), String(number))).toBeNull();

    const detail = await getSupplyDetail(admin(), arroz);
    expect(detail?.movements.find((movement) => movement.kind === "COUNT_OUT")?.inventoryCount).toEqual({
      id: countId,
      number,
    });
  });

  it("otra empresa no ve los conteos", async () => {
    expect((await getCountsOverview(sessionFor(b, userB), {})).counts).toEqual([]);
  });

  it("el rango es por día en la zona de la empresa, sin importar la de PostgreSQL", async () => {
    // 15/01 04:30 UTC = 14/01 23:30 en Bogotá (zona por defecto).
    await db.inventoryCount.update({
      where: { id: countId },
      data: { confirmedAt: new Date("2026-01-15T04:30:00Z") },
    });
    const on = async (day: string) =>
      (await getCountsOverview(admin(), { desde: day, hasta: day })).counts.map((count) => count.id);
    expect(await on("2026-01-14")).toContain(countId);
    expect(await on("2026-01-15")).not.toContain(countId);
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
      await expect(getCountsOverview(session, {})).rejects.toThrow(ForbiddenError);
      await expect(findCountByNumber(session, "1")).rejects.toThrow(ForbiddenError);
      await expect(startCount(session, mainA)).rejects.toThrow(ForbiddenError);
      await expect(saveCount(session, "x", [])).rejects.toThrow(ForbiddenError);
      await expect(confirmCount(session, "x", [])).rejects.toThrow(ForbiddenError);
    }
  });
});
