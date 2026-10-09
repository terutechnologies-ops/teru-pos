import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createDefaultPaymentMethods } from "@/server/data/payment-methods";
import type { StaffSessionDto } from "@/server/dto/auth";
import { PAYMENT_METHOD_EVENTS } from "@/server/services/auth/config";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createPaymentMethod,
  getPaymentMethods,
  movePaymentMethod,
  renamePaymentMethod,
  setPaymentMethodActive,
} from "@/server/services/payment-methods";

import { cleanupCompanies, createCompany, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("payments");
let a: { id: string; name: string; slug: string };
let b: { id: string; name: string; slug: string };

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: typeof a, role: StaffRole = "ADMIN"): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const names = async (company = a) =>
  (await getPaymentMethods(sessionFor(company))).map((m) => m.name);
const idOf = async (name: string, company = a) =>
  (await getPaymentMethods(sessionFor(company))).find((m) => m.name === name)!.id;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  for (const company of [a, b]) {
    await db.$transaction((tx) => createDefaultPaymentMethods(tx, company.id));
  }
});
afterAll(() => cleanupCompanies(tag));

describe("métodos de pago", () => {
  it("se agregan al final, sin nombres repetidos, y quedan auditados", async () => {
    const admin = sessionFor(a);
    expect(await createPaymentMethod(admin, "  Nequi ", ctx(tag))).toEqual({ ok: true });
    expect(await createPaymentMethod(admin, "nequi", ctx(tag))).toEqual({
      ok: false,
      error: "Ya existe un método de pago con ese nombre.",
    });
    expect(await createPaymentMethod(admin, "N", ctx(tag))).toMatchObject({ ok: false });
    // Crédito lo crea el sistema (inactivo); los nuevos van al final.
    expect(await names()).toEqual(["Efectivo", "Tarjeta", "Transferencia", "Crédito", "Nequi"]);

    const nequi = await idOf("Nequi");
    expect(
      await db.authAuditLog.count({
        where: { action: PAYMENT_METHOD_EVENTS.CREATED, targetType: "PAYMENT_METHOD", targetId: nequi },
      }),
    ).toBe(1);
  });

  it("se renombran y se desactivan, salvo el efectivo", async () => {
    const admin = sessionFor(a);
    const nequi = await idOf("Nequi");
    const cash = await idOf("Efectivo");

    expect(await renamePaymentMethod(admin, nequi, "Nequi QR", ctx(tag))).toEqual({ ok: true });
    expect(await renamePaymentMethod(admin, nequi, "tarjeta", ctx(tag))).toMatchObject({
      ok: false,
    });
    expect(await setPaymentMethodActive(admin, nequi, false, ctx(tag))).toEqual({ ok: true });

    const isCash = { ok: false, error: "El efectivo es del sistema: no se renombra ni se desactiva." };
    expect(await renamePaymentMethod(admin, cash, "Contado", ctx(tag))).toEqual(isCash);
    expect(await setPaymentMethodActive(admin, cash, false, ctx(tag))).toEqual(isCash);
    // Activar el efectivo (ya activo) no hace daño.
    expect(await setPaymentMethodActive(admin, cash, true, ctx(tag))).toEqual({ ok: true });

    const methods = await getPaymentMethods(admin);
    expect(methods.map((m) => [m.name, m.isActive])).toEqual([
      ["Efectivo", true],
      ["Tarjeta", true],
      ["Transferencia", true],
      ["Crédito", false],
      ["Nequi QR", false],
    ]);
    // Crédito sí se activa y desactiva (así una empresa decide si fía).
    const credit = await idOf("Crédito");
    expect(await setPaymentMethodActive(admin, credit, true, ctx(tag))).toEqual({ ok: true });
    expect(await setPaymentMethodActive(admin, credit, false, ctx(tag))).toEqual({ ok: true });
    expect(
      await db.authAuditLog.count({
        where: { targetId: nequi, action: { in: [PAYMENT_METHOD_EVENTS.RENAMED, PAYMENT_METHOD_EVENTS.DEACTIVATED] } },
      }),
    ).toBe(2);
  });

  it("se ordenan con las flechas", async () => {
    const admin = sessionFor(a);
    const nequi = await idOf("Nequi QR");
    expect(await movePaymentMethod(admin, nequi, "up")).toEqual({ ok: true });
    expect(await movePaymentMethod(admin, await idOf("Efectivo"), "up")).toMatchObject({
      ok: false,
    });
    expect(await names()).toEqual(["Efectivo", "Tarjeta", "Transferencia", "Nequi QR", "Crédito"]);
  });

  it("no tocan métodos de otra empresa", async () => {
    const adminB = sessionFor(b);
    const nequi = await idOf("Nequi QR");
    const gone = { ok: false, error: "El método de pago ya no existe. Actualiza la página." };
    expect(await renamePaymentMethod(adminB, nequi, "Robado", ctx(tag))).toEqual(gone);
    expect(await setPaymentMethodActive(adminB, nequi, true, ctx(tag))).toEqual(gone);
    expect(await movePaymentMethod(adminB, nequi, "down")).toMatchObject({ ok: false });
    expect(await names(b)).toEqual(["Efectivo", "Tarjeta", "Transferencia", "Crédito"]);
  });

  it("solo quien tiene payments.manage los gestiona", async () => {
    for (const role of ["STAFF", "CASHIER"] as const) {
      const session = sessionFor(a, role);
      await expect(getPaymentMethods(session)).rejects.toThrow(ForbiddenError);
      await expect(createPaymentMethod(session, "Bono", ctx(tag))).rejects.toThrow(ForbiddenError);
    }
    expect(await getPaymentMethods(sessionFor(a, "OWNER"))).toHaveLength(5);
  });
});
