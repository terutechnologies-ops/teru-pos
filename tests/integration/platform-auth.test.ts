import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { recordAuthEvent } from "@/server/data/auth-audit";
import { PLATFORM_SESSION_TTL_MS } from "@/server/services/auth/config";
import { hashToken } from "@/server/services/auth/tokens";
import {
  createPlatformAdmin,
  resetPlatformAdminPassword,
} from "@/server/services/platform/accounts";
import { getPlatformSession, loginPlatform, logoutPlatform } from "@/server/services/platform/auth";

import { cleanupPlatformUsers, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("teru-auth");
afterAll(() => cleanupPlatformUsers(tag));

const PASSWORD = "Clave-Teru-1";
const email = (name: string) => `${tag}-${name}@teru.co`;

async function newAdmin(name: string) {
  const result = await createPlatformAdmin({ name: "Equipo Teru", email: email(name), password: PASSWORD });
  if (!result.ok) throw new Error(result.error);
  return result.userId;
}

const login = (name: string, password = PASSWORD, ip = name) =>
  loginPlatform({ email: email(name), password }, ctx(tag, ip));

describe("login del equipo Teru", () => {
  it("entra, crea la sesión (solo el hash en BD), marca el ingreso y audita", async () => {
    const userId = await newAdmin("entra");
    const result = await login("ENTRA");
    if (!result.ok) throw new Error(result.error);

    const stored = await db.platformSession.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).toBe(hashToken(result.token));
    expect(stored.tokenHash).not.toBe(result.token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(PLATFORM_SESSION_TTL_MS - 60_000);

    const session = await getPlatformSession(result.token);
    expect(session?.user).toEqual({ id: userId, name: "Equipo Teru", email: email("entra") });
    expect((await db.platformUser.findUniqueOrThrow({ where: { id: userId } })).lastLoginAt).not.toBeNull();
    expect(
      await db.authAuditLog.findFirst({
        where: { actorType: "PLATFORM", actorId: userId, action: "PLATFORM_LOGIN_SUCCESS" },
      }),
    ).toMatchObject({ companyId: null });
  });

  it("mismo error con contraseña mala, correo inexistente o cuenta inactiva", async () => {
    const userId = await newAdmin("errores");
    expect(await login("errores", "otra-clave")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(await login("nadie")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    await db.platformUser.update({ where: { id: userId }, data: { isActive: false } });
    expect(await login("errores")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(await loginPlatform({ email: "malo", password: PASSWORD }, ctx(tag))).toEqual({
      ok: false,
      error: "INVALID_INPUT",
    });
  });

  it("bloquea la cuenta tras 5 fallos y el restablecimiento la desbloquea", async () => {
    await newAdmin("bloqueo");
    for (let i = 0; i < 5; i++) {
      expect((await login("bloqueo", "mala", `b${i}`)).ok).toBe(false);
    }
    expect(await login("bloqueo", PASSWORD, "b-ok")).toEqual({ ok: false, error: "TOO_MANY_ATTEMPTS" });

    expect((await resetPlatformAdminPassword({ email: email("bloqueo"), password: "Nueva-Clave-2" })).ok).toBe(true);
    expect((await login("bloqueo", "Nueva-Clave-2", "b-ok")).ok).toBe(true);
  });

  it("bloquea la IP tras 20 fallos; los fallos del login del personal no cuentan", async () => {
    await newAdmin("ip");
    const ip = ctx(tag, "ip-mala");
    // 20 fallos del personal desde la misma IP: no bloquean el login Teru.
    await Promise.all(
      Array.from({ length: 20 }, () =>
        recordAuthEvent({ companyId: null, actorType: "STAFF", actorId: null, action: "LOGIN_FAILED", ...ip }),
      ),
    );
    expect((await loginPlatform({ email: email("ip"), password: PASSWORD }, ip)).ok).toBe(true);

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        loginPlatform({ email: email(`z${i}`), password: "mala" }, ip),
      ),
    );
    expect(await loginPlatform({ email: email("ip"), password: PASSWORD }, ip)).toEqual({
      ok: false,
      error: "TOO_MANY_ATTEMPTS",
    });
  });

  it("renueva la sesión cuando queda menos de la mitad y el cierre la revoca", async () => {
    const userId = await newAdmin("renueva");
    const result = await login("renueva");
    if (!result.ok) throw new Error(result.error);

    const soon = new Date(Date.now() + 60_000);
    await db.platformSession.updateMany({ where: { userId }, data: { expiresAt: soon } });
    const renewed = await getPlatformSession(result.token);
    expect(renewed!.expiresAt.getTime()).toBeGreaterThan(soon.getTime() + PLATFORM_SESSION_TTL_MS / 2);

    await logoutPlatform(result.token, ctx(tag, "renueva"));
    expect(await getPlatformSession(result.token)).toBeNull();
    expect(
      await db.authAuditLog.count({ where: { actorId: userId, action: "PLATFORM_LOGOUT" } }),
    ).toBe(1);
    // Un token cualquiera o vacío no hace nada.
    await logoutPlatform("", ctx(tag));
    await logoutPlatform("otro", ctx(tag));
    expect(await getPlatformSession("")).toBeNull();
  });

  it("una sesión del personal no sirve en el panel Teru", async () => {
    const company = await db.company.create({ data: { name: "Empresa", slug: `${tag}-empresa` } });
    try {
      const user = await db.user.create({
        data: { companyId: company.id, email: email("staff"), name: "Staff", passwordHash: "x" },
      });
      await db.userSession.create({
        data: {
          userId: user.id,
          companyId: company.id,
          tokenHash: hashToken(`${tag}-staff-token`),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect(await getPlatformSession(`${tag}-staff-token`)).toBeNull();
    } finally {
      await db.userSession.deleteMany({ where: { companyId: company.id } });
      await db.user.deleteMany({ where: { companyId: company.id } });
      await db.company.delete({ where: { id: company.id } });
    }
  });
});
