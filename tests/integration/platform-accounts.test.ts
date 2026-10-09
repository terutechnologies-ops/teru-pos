import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createPlatformSession,
  extendPlatformSession,
  findActivePlatformSession,
  findPlatformUserCredentials,
  revokePlatformSession,
} from "@/server/data/platform";
import { verifyPassword } from "@/server/services/auth/passwords";
import {
  createPlatformAdmin,
  resetPlatformAdminPassword,
} from "@/server/services/platform/accounts";
import { companySlugSchema } from "@/server/validations/auth";

import { cleanupPlatformUsers, uniqueTag } from "../helpers";

const tag = uniqueTag("teru");
afterAll(() => cleanupPlatformUsers(tag));

const PASSWORD = "Clave-Teru-1";
const email = (name: string) => `${tag}-${name}@teru.co`;

async function newAdmin(name: string) {
  const result = await createPlatformAdmin({ name: "Equipo Teru", email: email(name), password: PASSWORD });
  if (!result.ok) throw new Error(result.error);
  return result.userId;
}

const HOUR = 60 * 60 * 1000;

describe("cuentas del equipo Teru", () => {
  it("crea la cuenta con el correo en minúsculas, contraseña cifrada y auditoría", async () => {
    const result = await createPlatformAdmin({
      name: "  Ana Teru ",
      email: email("ANA").toUpperCase(),
      password: PASSWORD,
    });
    expect(result.ok).toBe(true);
    const user = await findPlatformUserCredentials(email("ana"));
    expect(user).toMatchObject({ name: "Ana Teru", email: email("ana"), isActive: true });
    expect(user!.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(user!.passwordHash, PASSWORD)).toBe(true);

    const events = await db.authAuditLog.findMany({
      where: { targetType: "PLATFORM_USER", targetId: user!.id },
    });
    expect(events).toMatchObject([
      { action: "PLATFORM_USER_CREATED", actorType: "SYSTEM", companyId: null },
    ]);
  });

  it("rechaza datos inválidos y un correo repetido (sin distinguir mayúsculas)", async () => {
    await newAdmin("repetido");
    expect(
      await createPlatformAdmin({ name: "Otro", email: email("REPETIDO"), password: PASSWORD }),
    ).toEqual({ ok: false, error: "Ya existe una cuenta del equipo Teru con ese correo." });
    expect(
      (await createPlatformAdmin({ name: "Corta", email: email("corta"), password: "1234567" })).ok,
    ).toBe(false);
    expect((await createPlatformAdmin({ name: "A", email: email("nombre"), password: PASSWORD })).ok).toBe(false);
    expect((await createPlatformAdmin({ name: "Sin correo", email: "malo", password: PASSWORD })).ok).toBe(false);
  });

  it("la base rechaza un correo con mayúsculas", async () => {
    await expect(
      db.platformUser.create({
        data: { name: "Directo", email: `${tag}-DIRECTO@teru.co`, passwordHash: "x" },
      }),
    ).rejects.toThrow();
  });

  it("solo vale una sesión vigente, no revocada y de una cuenta activa", async () => {
    const userId = await newAdmin("sesiones");
    const now = new Date();
    await createPlatformSession({ userId, tokenHash: `${tag}-valida`, expiresAt: new Date(now.getTime() + HOUR) });
    await createPlatformSession({ userId, tokenHash: `${tag}-vencida`, expiresAt: new Date(now.getTime() - 1) });

    const session = await findActivePlatformSession(`${tag}-valida`);
    expect(session?.user).toMatchObject({ id: userId, email: email("sesiones") });
    expect(await findActivePlatformSession(`${tag}-vencida`)).toBeNull();
    expect(await findActivePlatformSession(`${tag}-otra`)).toBeNull();

    const later = new Date(now.getTime() + 2 * HOUR);
    await extendPlatformSession(session!.id, later);
    expect((await findActivePlatformSession(`${tag}-valida`))?.expiresAt).toEqual(later);

    await db.platformUser.update({ where: { id: userId }, data: { isActive: false } });
    expect(await findActivePlatformSession(`${tag}-valida`)).toBeNull();
    await db.platformUser.update({ where: { id: userId }, data: { isActive: true } });

    expect(await revokePlatformSession(`${tag}-valida`)).toBe(true);
    expect(await revokePlatformSession(`${tag}-valida`)).toBe(false);
    expect(await findActivePlatformSession(`${tag}-valida`)).toBeNull();
  });

  it("restablecer cambia la contraseña, cierra todas las sesiones y se audita", async () => {
    const userId = await newAdmin("reset");
    const expiresAt = new Date(Date.now() + HOUR);
    await createPlatformSession({ userId, tokenHash: `${tag}-r1`, expiresAt });
    await createPlatformSession({ userId, tokenHash: `${tag}-r2`, expiresAt });

    const result = await resetPlatformAdminPassword({ email: email("RESET"), password: "Nueva-Clave-2" });
    expect(result).toEqual({ ok: true, userId, revokedSessions: 2 });
    const user = await findPlatformUserCredentials(email("reset"));
    expect(await verifyPassword(user!.passwordHash, "Nueva-Clave-2")).toBe(true);
    expect(await findActivePlatformSession(`${tag}-r1`)).toBeNull();
    expect(
      await db.authAuditLog.count({
        where: { targetId: userId, action: "PLATFORM_PASSWORD_RESET" },
      }),
    ).toBe(1);

    expect(await resetPlatformAdminPassword({ email: email("nadie"), password: "Nueva-Clave-2" })).toEqual({
      ok: false,
      error: "No existe una cuenta del equipo Teru con ese correo.",
    });
  });

  it("el slug teru está reservado para el panel", () => {
    expect(companySlugSchema.safeParse("teru").success).toBe(false);
    expect(companySlugSchema.safeParse("teru-pos").success).toBe(true);
  });
});
