import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { getStaffSession, loginStaff } from "@/server/services/auth/staff-auth";
import { createPlatformAdmin } from "@/server/services/platform/accounts";
import type { PlatformSessionDto } from "@/server/services/platform/auth";
import {
  deactivatePlatformCompany,
  getPlatformCompanies,
  getPlatformCompany,
  reactivatePlatformCompany,
} from "@/server/services/platform/companies";

import type { StaffSessionDto } from "@/server/dto/auth";
import { openShift } from "@/server/services/cash-sessions";

import {
  cleanupCompanies,
  cleanupPlatformUsers,
  createCompany,
  createMainBranch,
  createUser,
  ctx,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("teru-acceso");
const PASSWORD = "Clave-Segura-1";
let teru: PlatformSessionDto;
let company: { id: string; slug: string };
let other: { id: string; slug: string };

afterAll(async () => {
  await cleanupCompanies(tag);
  await cleanupPlatformUsers(tag);
});

const staffLogin = (slug: string, email: string) =>
  loginStaff(slug, { email, password: PASSWORD, remember: false }, ctx(tag, email));

beforeAll(async () => {
  const admin = await createPlatformAdmin({ name: "Ana Teru", email: `${tag}-ana@teru.co`, password: "Clave-Teru-1" });
  if (!admin.ok) throw new Error(admin.error);
  teru = { sessionId: "s", expiresAt: new Date(), user: { id: admin.userId, name: "Ana Teru", email: `${tag}-ana@teru.co` } };
  company = await createCompany(`${tag}-a`, "Empresa A");
  other = await createCompany(`${tag}-b`, "Empresa B");
  const uno = await createUser({ companyId: company.id, email: `uno@${tag}.co`, role: "OWNER" });
  await createMainBranch(company.id);
  const staff: StaffSessionDto = {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: uno.id, name: "Uno", email: uno.email, role: "OWNER" },
    company: { id: company.id, name: "Empresa A", slug: company.slug, setupCompletedAt: new Date(), logoPath: null },
  };
  expect(await openShift(staff, { branchId: "", openingAmount: "0" })).toMatchObject({ ok: true });
  await createUser({ companyId: company.id, email: `dos@${tag}.co` });
  await createUser({ companyId: other.id, email: `otra@${tag}.co` });
});

describe("desactivar y reactivar empresas desde el panel Teru", () => {
  it("pide un motivo válido", async () => {
    expect(await deactivatePlatformCompany(teru, company.id, "  x ", ctx(tag))).toEqual({
      ok: false,
      error: "Escribe el motivo (mínimo 3 caracteres).",
    });
    expect((await deactivatePlatformCompany(teru, company.id, "x".repeat(201), ctx(tag))).ok).toBe(false);
    expect(await deactivatePlatformCompany(teru, "no-existe", "Motivo", ctx(tag))).toEqual({
      ok: false,
      error: "Esta empresa no existe.",
    });
  });

  it("desactivar cierra las sesiones, bloquea el login y queda en la ficha y en auditoría", async () => {
    const first = await staffLogin(company.slug, `uno@${tag}.co`);
    const second = await staffLogin(company.slug, `dos@${tag}.co`);
    const keep = await staffLogin(other.slug, `otra@${tag}.co`);
    if (!first.ok || !second.ok || !keep.ok) throw new Error("no entró");

    expect(await deactivatePlatformCompany(teru, company.id, " Suscripción vencida ", ctx(tag, "teru"))).toEqual({
      ok: true,
      revokedSessions: 2,
    });
    expect(await getStaffSession(company.slug, first.token)).toBeNull();
    expect(await db.userSession.count({ where: { companyId: company.id, revokedAt: null } })).toBe(0);
    expect(await staffLogin(company.slug, `uno@${tag}.co`)).toEqual({ ok: false, error: "COMPANY_NOT_FOUND" });
    // Otra empresa no se toca.
    expect(await getStaffSession(other.slug, keep.token)).not.toBeNull();

    const detail = await getPlatformCompany(teru, company.id);
    expect(detail).toMatchObject({
      status: "INACTIVE",
      deactivation: { reason: "Suscripción vencida", by: "Ana Teru" },
      // El turno abierto antes de desactivar sigue abierto.
      openShifts: 1,
      statusChanges: [{ isActive: false, reason: "Suscripción vencida", by: "Ana Teru" }],
    });
    const { companies } = await getPlatformCompanies(teru);
    expect(companies.find((c) => c.id === company.id)?.status).toBe("INACTIVE");
    expect(
      await db.authAuditLog.findFirst({ where: { companyId: company.id, action: "COMPANY_DEACTIVATED" } }),
    ).toMatchObject({ actorType: "PLATFORM", actorId: teru.user.id, ipAddress: `${tag}-ip-teru` });

    expect(await deactivatePlatformCompany(teru, company.id, "Otra vez", ctx(tag))).toEqual({
      ok: false,
      error: "La empresa ya estaba desactivada.",
    });
  });

  it("reactivar borra el motivo y el personal vuelve a entrar (las sesiones cerradas no vuelven)", async () => {
    const before = await db.userSession.findFirstOrThrow({ where: { companyId: company.id } });
    expect(await reactivatePlatformCompany(teru, company.id, ctx(tag))).toEqual({ ok: true, revokedSessions: 0 });

    const row = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(row).toMatchObject({ isActive: true, deactivatedAt: null, deactivationReason: null, deactivatedById: null });
    const detail = await getPlatformCompany(teru, company.id);
    expect(detail?.deactivation).toBeNull();
    // Historial completo, el más reciente primero.
    expect(detail?.statusChanges.map((c) => [c.isActive, c.reason, c.by])).toEqual([
      [true, null, "Ana Teru"],
      [false, "Suscripción vencida", "Ana Teru"],
    ]);
    expect((await db.userSession.findUniqueOrThrow({ where: { id: before.id } })).revokedAt).not.toBeNull();
    expect((await staffLogin(company.slug, `uno@${tag}.co`)).ok).toBe(true);
    expect(
      await db.authAuditLog.count({ where: { companyId: company.id, action: "COMPANY_REACTIVATED", actorType: "PLATFORM" } }),
    ).toBe(1);

    expect(await reactivatePlatformCompany(teru, company.id, ctx(tag))).toEqual({
      ok: false,
      error: "La empresa ya estaba activa.",
    });
  });

  it("la base exige fecha y motivo en una empresa inactiva y motivo solo al desactivar", async () => {
    await expect(
      db.companyStatusChange.create({ data: { companyId: other.id, isActive: false, reason: null } }),
    ).rejects.toThrow();
    await expect(
      db.companyStatusChange.create({ data: { companyId: other.id, isActive: true, reason: "Motivo" } }),
    ).rejects.toThrow();
    await expect(db.company.update({ where: { id: other.id }, data: { isActive: false } })).rejects.toThrow();
    await expect(
      db.company.update({ where: { id: other.id }, data: { deactivatedAt: new Date(), deactivationReason: "Motivo" } }),
    ).rejects.toThrow();
  });

  it("sin sesión del equipo Teru no cambia nada", async () => {
    const none = {} as PlatformSessionDto;
    await expect(deactivatePlatformCompany(none, other.id, "Motivo", ctx(tag))).rejects.toThrow();
    await expect(reactivatePlatformCompany(none, other.id, ctx(tag))).rejects.toThrow();
    expect((await db.company.findUniqueOrThrow({ where: { id: other.id } })).isActive).toBe(true);
  });
});
