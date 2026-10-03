import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
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
import type { SupplyInput } from "@/server/validations/inventory";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  ctx,
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
const ctxA = ctx(tag);
// Lo que envía el formulario: todo texto, vacío = sin valor.
const input = (fields: Partial<SupplyInput> & Pick<SupplyInput, "name" | "unit">): SupplyInput => ({
  minStock: "",
  unitCost: "",
  ...fields,
});
const create = (fields: Parameters<typeof input>[0], session = admin()) =>
  createInventorySupply(session, input(fields), ctxA);
const update = (id: string, fields: Parameters<typeof input>[0], session = admin()) =>
  updateInventorySupply(session, id, input(fields), ctxA);
const list = async (filters: Parameters<typeof getSupplyList>[1] = {}, session = admin()) =>
  (await getSupplyList(session, filters)).supplies;
const idOf = async (name: string) => (await list()).find((s) => s.name === name)!.id;
const costEvents = (supplyId: string) =>
  db.authAuditLog.count({
    where: { action: "SUPPLY_COST_CHANGED", targetType: "SUPPLY", targetId: supplyId },
  });
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
    expect(await create({ name: " Harina ", unit: "KG", minStock: "5" })).toMatchObject({
      ok: true,
    });
    expect(await create({ name: "Gaseosa", unit: "UNIT" })).toMatchObject({ ok: true });
    expect(await create({ name: "harina", unit: "G" })).toEqual({
      ok: false,
      fieldErrors: { name: "Ya existe un insumo con ese nombre." },
    });
    expect(await create({ name: "X", unit: "", minStock: "1,5", unitCost: "-2" })).toEqual({
      ok: false,
      fieldErrors: {
        name: "Escribe el nombre (mínimo 2 caracteres).",
        unit: "Elige una unidad.",
        minStock: "Escribe una cantidad válida (solo números, sin signos).",
        unitCost: "Escribe un costo válido (solo números, sin signos).",
      },
    });
  });

  it("lista con existencia total y marca los que están bajo el mínimo", async () => {
    const harina = await idOf("Harina");
    // Sin carga inicial la existencia no se conoce: no se marca bajo mínimo.
    expect(
      (await list()).map((s) => [s.name, s.totalStock, s.uninitialized, s.belowMinimum]),
    ).toEqual([
      ["Gaseosa", "0", true, false],
      ["Harina", "0", true, false],
    ]);

    await move(harina, "7.25", "INITIAL");
    expect(await getSupplyList(admin(), { search: "HAR" })).toEqual({
      currency: "COP",
      mainWarehouseId: warehouseA,
      supplies: [
        expect.objectContaining({
          name: "Harina",
          unit: "KG",
          minStock: "5",
          unitCost: null,
          totalStock: "7.25",
          uninitialized: false,
          belowMinimum: false,
          negativeStock: false,
        }),
      ],
    });
    expect(await list({}, sessionFor(b, "OWNER"))).toEqual([]);
  });

  it("edita; la unidad queda fija cuando hay movimientos", async () => {
    const harina = await idOf("Harina");
    const gaseosa = await idOf("Gaseosa");

    expect(await getSupply(admin(), harina)).toMatchObject({ unitLocked: true, currency: "COP" });
    expect(await getSupply(admin(), gaseosa)).toMatchObject({ unitLocked: false });
    expect(await getSupply(sessionFor(b, "OWNER"), harina)).toBeNull();

    expect(await update(harina, { name: "Harina", unit: "G", minStock: "5" })).toEqual({
      ok: false,
      fieldErrors: { unit: "La unidad no se puede cambiar: el insumo ya tiene movimientos." },
    });
    expect(await update(harina, { name: "Harina PAN", unit: "KG", minStock: "10" })).toEqual({
      ok: true,
      supplyId: harina,
    });
    expect(await getSupply(admin(), harina)).toMatchObject({
      name: "Harina PAN",
      minStock: "10",
      belowMinimum: true,
    });

    expect(await update(gaseosa, { name: "Gaseosa", unit: "L" })).toEqual({
      ok: true,
      supplyId: gaseosa,
    });
    expect(await update(gaseosa, { name: "Robada", unit: "L" }, sessionFor(b, "OWNER"))).toEqual({
      ok: false,
      fieldErrors: {},
      error: "El insumo ya no existe. Actualiza la página.",
    });
  });

  it("no archiva con existencias; en cero sí, y se restaura", async () => {
    const harina = await idOf("Harina PAN");
    expect(await setInventorySupplyArchived(admin(), harina, true)).toEqual({
      ok: false,
      error: "Este insumo tiene existencias: ajústalas a cero antes de archivarlo.",
    });
    await move(harina, "-7.25");
    expect(await setInventorySupplyArchived(admin(), harina, true)).toEqual({ ok: true });
    expect((await list()).map((s) => s.name)).toEqual(["Gaseosa"]);
    expect((await list({ archived: true })).map((s) => s.name)).toEqual(["Harina PAN"]);
    expect(await setInventorySupplyArchived(admin(), harina, false)).toEqual({ ok: true });
  });

  it("el personal no gestiona insumos", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(getSupplyList(staff, {})).rejects.toThrow(ForbiddenError);
    await expect(create({ name: "Otra", unit: "G" }, staff)).rejects.toThrow(ForbiddenError);
    await expect(setInventorySupplyArchived(staff, "x", true)).rejects.toThrow(ForbiddenError);
  });
});

describe("costo de referencia", () => {
  it("admite hasta 4 decimales en cualquier moneda y lo normaliza", async () => {
    expect(await create({ name: "Queso", unit: "G", unitCost: "3.25000" })).toMatchObject({
      ok: true,
    });
    const queso = await idOf("Queso");
    expect(await getSupply(admin(), queso)).toMatchObject({ unitCost: "3.25" });

    expect(await update(queso, { name: "Queso", unit: "G", unitCost: "3.25001" })).toEqual({
      ok: false,
      fieldErrors: { unitCost: "Usa máximo 4 decimales." },
    });
    expect(await update(queso, { name: "Queso", unit: "G", unitCost: "99999999999" })).toEqual({
      ok: false,
      fieldErrors: { unitCost: "El costo es demasiado alto." },
    });
  });

  it("audita cada cambio de costo con el insumo, y solo cuando cambia", async () => {
    // Creado con costo: primer evento.
    const queso = await idOf("Queso");
    expect(await costEvents(queso)).toBe(1);

    // Mismo costo escrito distinto y otro campo cambiado: sin evento.
    await update(queso, { name: "Queso costeño", unit: "G", unitCost: "3.2500" });
    expect(await costEvents(queso)).toBe(1);

    await update(queso, { name: "Queso costeño", unit: "G", unitCost: "4" });
    await update(queso, { name: "Queso costeño", unit: "G", unitCost: "" });
    expect(await costEvents(queso)).toBe(3);
    expect(await getSupply(admin(), queso)).toMatchObject({ unitCost: null });

    // Creado sin costo: nada que auditar.
    expect(await costEvents(await idOf("Gaseosa"))).toBe(0);
    const [event] = await db.authAuditLog.findMany({
      where: { action: "SUPPLY_COST_CHANGED", targetId: queso },
      take: 1,
    });
    expect(event).toMatchObject({ companyId: a.id, actorType: "STAFF", actorId: "u" });
  });
});
