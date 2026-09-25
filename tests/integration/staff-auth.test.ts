import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  getStaffSession,
  loginStaff,
  logoutStaff,
} from "@/server/services/auth/staff-auth";

import {
  cleanupCompanies,
  createCompany,
  createUser,
  ctx,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("auth");
const PASSWORD = "Clave-Segura-1";
const ownerEmail = `ana@${tag}.co`;
let a: { id: string; slug: string };
let b: { id: string; slug: string };

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await createUser({
    companyId: a.id,
    email: ownerEmail,
    role: "OWNER",
    name: "Ana",
  });
  await createUser({ companyId: a.id, email: `off@${tag}.co`, isActive: false });
});
afterAll(() => cleanupCompanies(tag));

function login(
  slug: string,
  email: string,
  password: string,
  ip = "1",
  remember = false,
) {
  return loginStaff(slug, { email, password, remember }, ctx(tag, ip));
}

describe("loginStaff", () => {
  it("rechaza entrada inválida y empresa inexistente", async () => {
    expect(await login(a.slug, "no-es-email", "x")).toEqual({
      ok: false,
      error: "INVALID_INPUT",
    });
    expect(await login(`${tag}-nada`, ownerEmail, PASSWORD)).toEqual({
      ok: false,
      error: "COMPANY_NOT_FOUND",
    });
  });

  it("mismo error para clave errada, correo inexistente, usuario inactivo u otra empresa", async () => {
    const results = await Promise.all([
      login(a.slug, ownerEmail, "mala"),
      login(a.slug, `nadie@${tag}.co`, PASSWORD),
      login(a.slug, `off@${tag}.co`, PASSWORD),
      login(b.slug, ownerEmail, PASSWORD),
    ]);
    for (const r of results) {
      expect(r).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    }
  });

  it("inicia sesión normalizando el correo: 12 h por defecto, 30 días con recordar", async () => {
    const r = await login(a.slug, `  ${ownerEmail.toUpperCase()} `, PASSWORD);
    if (!r.ok) throw new Error(r.error);
    expect(r.companySlug).toBe(a.slug);
    expect(Math.abs(r.expiresAt.getTime() - Date.now() - 12 * 3600e3)).toBeLessThan(60e3);

    const remembered = await login(a.slug, ownerEmail, PASSWORD, "1", true);
    if (!remembered.ok) throw new Error(remembered.error);
    expect(remembered.persistent).toBe(true);
    expect(remembered.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * 86400e3,
    );
  });
});

describe("getStaffSession y logoutStaff", () => {
  it("valida la sesión solo en su empresa, la renueva y la cierra", async () => {
    const r = await login(a.slug, ownerEmail, PASSWORD);
    if (!r.ok) throw new Error(r.error);

    const s = await getStaffSession(a.slug, r.token);
    expect(s?.session.user).toMatchObject({ email: ownerEmail, role: "OWNER" });
    expect(s?.renewed).toBe(false);
    expect(s?.session.company.setupCompletedAt).toBeNull();
    expect(await getStaffSession(b.slug, r.token)).toBeNull();
    expect(await getStaffSession(a.slug, "token-falso")).toBeNull();

    await db.userSession.updateMany({
      where: { id: s!.session.sessionId },
      data: { expiresAt: new Date(Date.now() + 3600e3) },
    });
    await db.company.update({
      where: { id: a.id },
      data: { setupCompletedAt: new Date() },
    });
    const renewed = await getStaffSession(a.slug, r.token);
    expect(renewed?.renewed).toBe(true);
    expect(renewed?.session.company.setupCompletedAt).toBeInstanceOf(Date);
    expect(renewed!.session.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 11 * 3600e3,
    );

    await logoutStaff(a.slug, r.token, ctx(tag));
    expect(await getStaffSession(a.slug, r.token)).toBeNull();
  });
});

describe("límite de intentos", () => {
  it("bloquea la cuenta tras 5 fallos aunque luego la clave sea correcta", async () => {
    const email = `lock@${tag}.co`;
    await createUser({ companyId: a.id, email });
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        login(a.slug, email, "mala", `lock-${i}`),
      ),
    );
    expect(await login(a.slug, email, PASSWORD, "lock-ok")).toEqual({
      ok: false,
      error: "TOO_MANY_ATTEMPTS",
    });
  });

  it("bloquea la IP tras 20 fallos sin afectar otras IP", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        login(a.slug, `x${i}@${tag}.co`, "m", "ip-mala"),
      ),
    );
    expect(await login(a.slug, ownerEmail, PASSWORD, "ip-mala")).toEqual({
      ok: false,
      error: "TOO_MANY_ATTEMPTS",
    });
    expect((await login(a.slug, ownerEmail, PASSWORD, "ip-buena")).ok).toBe(
      true,
    );
  });

  it("registra los eventos en la auditoría", async () => {
    const events = await db.authAuditLog.groupBy({
      by: ["action"],
      where: { companyId: a.id },
      _count: true,
    });
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "LOGIN_BLOCKED",
        "LOGOUT",
      ]),
    );
  });
});
