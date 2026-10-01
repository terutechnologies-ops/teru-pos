import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  closeShift,
  getClosedShift,
  getPosShift,
  openShift,
} from "@/server/services/cash-sessions";

import {
  cleanupCompanies,
  createCompany,
  createMainBranch,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("shifts");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let cashier: StaffSessionDto;
let otherCashier: StaffSessionDto;
let cashierB: StaffSessionDto;

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function cashierOf(company: Company, name: string) {
  const user = await createUser({
    companyId: company.id,
    email: `${name}@${tag}.co`,
    role: "CASHIER",
  });
  return sessionFor(company, user.id, "CASHIER");
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await createMainBranch(a.id);
  await createMainBranch(b.id);
  cashier = await cashierOf(a, "cajero");
  otherCashier = await cashierOf(a, "otro");
  cashierB = await cashierOf(b, "cajero-b");
});
afterAll(() => cleanupCompanies(tag));

describe("abrir turno", () => {
  it("con una sola sucursal la toma sola y valida el fondo", async () => {
    expect((await getPosShift(cashier)).shift).toBeNull();

    expect(await openShift(cashier, { branchId: "", openingAmount: "100,5" })).toEqual({
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: { openingAmount: "Esta moneda no usa centavos." },
    });
    expect(await openShift(cashier, { branchId: "", openingAmount: "" })).toMatchObject({
      fieldErrors: { openingAmount: "Escribe el fondo inicial." },
    });

    const opened = await openShift(cashier, { branchId: "", openingAmount: "100.000" });
    expect(opened.ok).toBe(true);
    const pos = await getPosShift(cashier);
    expect(pos.shift).toMatchObject({
      branchName: "Sede principal",
      openingAmount: "100000",
      salesCount: 0,
    });
    expect(pos.stale).toBe(false);

    expect(await openShift(cashier, { branchId: "", openingAmount: "0" })).toEqual({
      ok: false,
      error: "Ya tienes un turno abierto. Actualiza la página.",
    });
  });

  it("con varias sucursales hay que elegir, y solo de la propia empresa", async () => {
    await db.branch.create({ data: { companyId: a.id, name: "Sede norte" } });
    expect(await openShift(otherCashier, { branchId: "", openingAmount: "0" })).toMatchObject({
      fieldErrors: { branchId: "Elige la sucursal." },
    });
    const branchB = await db.branch.findFirstOrThrow({ where: { companyId: b.id } });
    expect(
      await openShift(otherCashier, { branchId: branchB.id, openingAmount: "0" }),
    ).toMatchObject({ fieldErrors: { branchId: "La sucursal ya no está disponible." } });

    const norte = await db.branch.findFirstOrThrow({ where: { companyId: a.id, name: "Sede norte" } });
    expect((await openShift(otherCashier, { branchId: norte.id, openingAmount: "0" })).ok).toBe(true);
    expect((await getPosShift(otherCashier)).shift?.branchName).toBe("Sede norte");
  });

  it("avisa si el turno quedó abierto desde otro día", async () => {
    const pos = await getPosShift(cashier, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    expect(pos.stale).toBe(true);
  });
});

describe("cerrar turno", () => {
  it("cierra con conteo ciego y solo su dueño ve el resultado", async () => {
    expect(await closeShift(cashierB, { countedCash: "0", closingNote: "" })).toEqual({
      ok: false,
      error: "No tienes un turno abierto. Actualiza la página.",
    });
    expect(await closeShift(cashier, { countedCash: "abc", closingNote: "" })).toMatchObject({
      fieldErrors: { countedCash: "Escribe un conteo válido (solo números, sin signos)." },
    });

    const closed = await closeShift(cashier, { countedCash: "99000", closingNote: "  Faltan mil " });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;

    const result = await getClosedShift(cashier, closed.cashSessionId);
    expect(result?.shift).toMatchObject({
      expectedCash: "100000",
      countedCash: "99000",
      difference: "-1000",
      closingNote: "Faltan mil",
    });
    expect(await getClosedShift(otherCashier, closed.cashSessionId)).toBeNull();
    expect(await getClosedShift(cashierB, closed.cashSessionId)).toBeNull();
    expect((await getPosShift(cashier)).shift).toBeNull();
  });

  it("un turno abierto no tiene resumen de cierre", async () => {
    const open = (await getPosShift(otherCashier)).shift!;
    expect(await getClosedShift(otherCashier, open.id)).toBeNull();
  });
});

describe("permisos", () => {
  it("el personal sin sales.charge no maneja turnos", async () => {
    const staff = sessionFor(a, "staff", "STAFF");
    await expect(getPosShift(staff)).rejects.toThrow(ForbiddenError);
    await expect(openShift(staff, { branchId: "", openingAmount: "0" })).rejects.toThrow(
      ForbiddenError,
    );
    await expect(closeShift(staff, { countedCash: "0", closingNote: "" })).rejects.toThrow(
      ForbiddenError,
    );
  });
});
