import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { base32Decode, hotp, totpStep } from "@/server/services/auth/totp";
import { createPlatformAdmin, resetPlatformAdminMfa } from "@/server/services/platform/accounts";
import {
  confirmPlatformEnrollment,
  getPlatformChallenge,
  getPlatformSession,
  loginPlatform,
  logoutPlatform,
  startPlatformEnrollment,
  verifyPlatformMfa,
} from "@/server/services/platform/auth";

import { cleanupPlatformUsers, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("teru-mfa");
const PASSWORD = "Clave-Teru-1";
const email = (name: string) => `${tag}-${name}@teru.co`;
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.TOTP_ENCRYPTION_KEY;
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  if (!process.env.TOTP_ENCRYPTION_KEY) process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterAll(async () => {
  process.env.TOTP_ENCRYPTION_KEY = previousKey;
  await cleanupPlatformUsers(tag);
});

async function newAdmin(name: string) {
  const result = await createPlatformAdmin({ name: "Equipo Teru", email: email(name), password: PASSWORD });
  if (!result.ok) throw new Error(result.error);
  return result.userId;
}

async function login(name: string, ip = name) {
  const result = await loginPlatform({ email: email(name), password: PASSWORD }, ctx(tag, ip));
  if (!result.ok) throw new Error(result.error);
  return result;
}

// Código de la app para la clave mostrada ("ABCD EFGH ..."), `offset` pasos
// después del actual.
function codeFor(secret: string, offset = 0) {
  return hotp(base32Decode(secret)!, totpStep(new Date()) + offset);
}

const events = (userId: string, action: string) => db.authAuditLog.count({ where: { actorId: userId, action } });

// Cuenta con la verificación ya activada: devuelve la clave y los códigos.
async function enrolledAdmin(name: string) {
  const userId = await newAdmin(name);
  const { token } = await login(name);
  const enrollment = (await startPlatformEnrollment(token))!;
  const result = await confirmPlatformEnrollment(token, codeFor(enrollment.secret), ctx(tag, name));
  if (!result.ok) throw new Error(result.error);
  await logoutPlatform(token, ctx(tag, name));
  return { userId, secret: enrollment.secret, recoveryCodes: result.recoveryCodes };
}

describe("verificación en dos pasos del equipo Teru", () => {
  it("la primera vez activa la verificación con QR, guarda la clave cifrada y entrega códigos de respaldo", async () => {
    const userId = await newAdmin("activa");
    const { token, next } = await login("activa");
    expect(next).toBe("ENROLL");

    const first = (await startPlatformEnrollment(token))!;
    expect(first.secret).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    expect(first.uri).toContain(`secret=${first.secret.replace(/ /g, "")}`);
    expect(first.qrSvg).toContain("<svg");
    // Recargar la página muestra la misma clave.
    expect((await startPlatformEnrollment(token))!.secret).toBe(first.secret);
    const stored = await db.platformUser.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.totpSecret).toMatch(/^v1:/);
    expect(stored.totpSecret).not.toContain(first.secret.replace(/ /g, ""));
    expect(stored.totpEnabledAt).toBeNull();

    expect(await confirmPlatformEnrollment(token, "000000", ctx(tag, "activa"))).toEqual({
      ok: false,
      error: "INVALID_CODE",
    });
    expect(await getPlatformSession(token)).toBeNull();

    const result = await confirmPlatformEnrollment(token, codeFor(first.secret), ctx(tag, "activa"));
    if (!result.ok) throw new Error(result.error);
    expect(result.recoveryCodes).toHaveLength(8);
    expect(await getPlatformSession(token)).toMatchObject({ user: { id: userId } });
    expect(await getPlatformChallenge(token)).toBeNull();

    const after = await db.platformUser.findUniqueOrThrow({ where: { id: userId } });
    expect(after.totpEnabledAt).not.toBeNull();
    expect(after.lastLoginAt).not.toBeNull();
    const hashes = await db.platformRecoveryCode.findMany({ where: { userId } });
    expect(hashes).toHaveLength(8);
    expect(hashes.map((h) => h.codeHash)).not.toContain(result.recoveryCodes[0]);
    expect(await events(userId, "PLATFORM_MFA_ENROLLED")).toBe(1);
    expect(await events(userId, "PLATFORM_LOGIN_SUCCESS")).toBe(1);
    // Ya activada: no se vuelve a mostrar el QR.
    expect(await startPlatformEnrollment(token)).toBeNull();
  });

  it("después pide el código; un código ya usado no sirve otra vez", async () => {
    const { userId, secret } = await enrolledAdmin("codigo");
    const { token, next } = await login("codigo", "codigo-2");
    expect(next).toBe("VERIFY");
    expect(await getPlatformChallenge(token)).toMatchObject({ enrolled: true });
    // Una cuenta activada no recibe un QR nuevo.
    expect(await startPlatformEnrollment(token)).toBeNull();
    expect(await confirmPlatformEnrollment(token, codeFor(secret), ctx(tag))).toEqual({
      ok: false,
      error: "SESSION_EXPIRED",
    });

    // El código con el que se activó ya se usó (se compara con el paso
    // guardado, no con el reloj: la prueba no depende del cambio de 30 s).
    const { totpLastStep } = await db.platformUser.findUniqueOrThrow({ where: { id: userId } });
    const codeAt = (step: number) => hotp(base32Decode(secret)!, step);
    expect(await verifyPlatformMfa(token, { code: codeAt(totpLastStep!) }, ctx(tag))).toEqual({
      ok: false,
      error: "INVALID_CODE",
    });
    // El siguiente (dentro de la ventana) sí.
    expect(await verifyPlatformMfa(token, { code: codeAt(totpLastStep! + 1) }, ctx(tag))).toEqual({
      ok: true,
      recoveryCodesLeft: null,
    });
    expect(await getPlatformSession(token)).toMatchObject({ user: { id: userId } });
    expect(await events(userId, "PLATFORM_LOGIN_SUCCESS")).toBe(2);
  });

  it("un código de respaldo sirve una vez y avisa cuántos quedan", async () => {
    const { userId, recoveryCodes } = await enrolledAdmin("respaldo");
    const first = await login("respaldo", "r1");
    const typed = recoveryCodes[0].toLowerCase().replace("-", " ");
    expect(await verifyPlatformMfa(first.token, { recoveryCode: typed }, ctx(tag))).toEqual({
      ok: true,
      recoveryCodesLeft: 7,
    });
    expect(await events(userId, "PLATFORM_RECOVERY_CODE_USED")).toBe(1);

    const second = await login("respaldo", "r2");
    expect(await verifyPlatformMfa(second.token, { recoveryCode: recoveryCodes[0] }, ctx(tag))).toEqual({
      ok: false,
      error: "INVALID_CODE",
    });
    expect(await verifyPlatformMfa(second.token, { recoveryCode: "nada" }, ctx(tag))).toEqual({
      ok: false,
      error: "INVALID_CODE",
    });
    expect(await getPlatformSession(second.token)).toBeNull();
  });

  it("5 códigos fallidos cierran el ingreso y bloquean; reiniciar con el script desbloquea", async () => {
    const { userId, secret } = await enrolledAdmin("bloqueo");
    const { token } = await login("bloqueo", "b1");
    for (let i = 0; i < 4; i++) {
      expect(await verifyPlatformMfa(token, { code: "000000" }, ctx(tag))).toEqual({
        ok: false,
        error: "INVALID_CODE",
      });
    }
    expect(await verifyPlatformMfa(token, { code: "000000" }, ctx(tag))).toEqual({
      ok: false,
      error: "TOO_MANY_ATTEMPTS",
    });
    expect(await getPlatformChallenge(token)).toBeNull();

    // Con la contraseña otra vez, el código correcto sigue bloqueado.
    const again = await login("bloqueo", "b2");
    expect(await verifyPlatformMfa(again.token, { code: codeFor(secret, 1) }, ctx(tag))).toEqual({
      ok: false,
      error: "TOO_MANY_ATTEMPTS",
    });
    expect(await events(userId, "PLATFORM_MFA_BLOCKED")).toBe(2);

    // Teléfono perdido: el script borra la verificación y cierra sus sesiones.
    const third = await login("bloqueo", "b3");
    expect(await resetPlatformAdminMfa(email("bloqueo"))).toEqual({ ok: true, revokedSessions: 1 });
    expect(await getPlatformChallenge(third.token)).toBeNull();
    expect(await db.platformRecoveryCode.count({ where: { userId } })).toBe(0);
    const fresh = await login("bloqueo", "b4");
    expect(fresh.next).toBe("ENROLL");
    const enrollment = (await startPlatformEnrollment(fresh.token))!;
    expect(enrollment.secret).not.toBe(secret);
    expect((await confirmPlatformEnrollment(fresh.token, codeFor(enrollment.secret), ctx(tag))).ok).toBe(true);
    expect(await resetPlatformAdminMfa(email("nadie"))).toMatchObject({ ok: false });
  });

  it("la sesión pendiente vence a los 5 minutos y el cierre también la revoca", async () => {
    const { userId, secret } = await enrolledAdmin("vence");
    const { token } = await login("vence", "v1");
    await db.platformSession.updateMany({
      where: { userId, mfaVerifiedAt: null, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getPlatformChallenge(token)).toBeNull();
    expect(await verifyPlatformMfa(token, { code: codeFor(secret, 1) }, ctx(tag))).toEqual({
      ok: false,
      error: "SESSION_EXPIRED",
    });

    const other = await login("vence", "v2");
    await logoutPlatform(other.token, ctx(tag));
    expect(await getPlatformChallenge(other.token)).toBeNull();
  });

  it("sin la llave de cifrado no se puede activar", async () => {
    await newAdmin("sin-llave");
    const { token } = await login("sin-llave");
    process.env.TOTP_ENCRYPTION_KEY = "";
    await expect(startPlatformEnrollment(token)).rejects.toThrow("TOTP_ENCRYPTION_KEY");
  });
});
