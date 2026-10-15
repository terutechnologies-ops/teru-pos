import "server-only";

import QRCode from "qrcode";

import { PLATFORM_NAME } from "@/lib/brand";
import type { RequestContext } from "@/server/dto/auth";
import {
  countRecentAuthEvents,
  findLatestAuthEventAt,
  recordAuthEvent,
} from "@/server/data/auth-audit";
import {
  completePlatformMfa,
  countUnusedRecoveryCodes,
  createPlatformSession,
  extendPlatformSession,
  findActivePlatformSession,
  findPlatformUserCredentials,
  findPlatformUserTotp,
  markPlatformUserLogin,
  revokePlatformSession,
  revokePlatformSessionById,
  savePendingTotpSecret,
  type ActivePlatformSession,
} from "@/server/data/platform";
import { getTotpEncryptionKey } from "@/server/env";
import {
  LOGIN_WINDOW_MS,
  MAX_FAILED_LOGINS_PER_ACCOUNT,
  MAX_FAILED_LOGINS_PER_IP,
  MAX_FAILED_MFA_PER_ACCOUNT,
  PLATFORM_EVENTS,
  PLATFORM_MFA_PENDING_TTL_MS,
  PLATFORM_RECOVERY_CODE_COUNT,
  PLATFORM_SESSION_TTL_MS,
  PLATFORM_USER_TARGET,
} from "@/server/services/auth/config";
import { verifyAgainstDummy, verifyPassword } from "@/server/services/auth/passwords";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "@/server/services/auth/recovery-codes";
import { decryptSecret, encryptSecret } from "@/server/services/auth/secret-box";
import { generateToken, hashToken } from "@/server/services/auth/tokens";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/server/services/auth/totp";
import { platformLoginSchema } from "@/server/validations/platform";

// Login del equipo Teru (panel /teru). Mismo esquema que el del personal
// (sesiones propias en BD, token en cookie, hash en BD, límite de intentos)
// pero sin empresa: estas sesiones no dan acceso a ninguna empresa.
//
// Dos pasos: la contraseña crea una sesión pendiente de 5 minutos que solo
// sirve para el segundo paso; con el código de la app autenticadora (o un
// código de respaldo) la sesión queda verificada con su duración normal.
// Una cuenta sin la verificación activada la activa en ese momento.

export type PlatformSessionDto = {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string };
};

export type PlatformLoginError = "INVALID_INPUT" | "INVALID_CREDENTIALS" | "TOO_MANY_ATTEMPTS";

export type PlatformLoginResult =
  | { ok: true; token: string; expiresAt: Date; next: "VERIFY" | "ENROLL" }
  | { ok: false; error: PlatformLoginError };

function audit(action: string, actorId: string | null, ctx: RequestContext) {
  return recordAuthEvent({
    companyId: null,
    actorType: "PLATFORM",
    actorId,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function loginPlatform(
  rawInput: unknown,
  ctx: RequestContext,
): Promise<PlatformLoginResult> {
  const input = platformLoginSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "INVALID_INPUT" };
  const { email, password } = input.data;
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);

  if (ctx.ipAddress) {
    const ipFailures = await countRecentAuthEvents({
      action: PLATFORM_EVENTS.LOGIN_FAILED,
      ipAddress: ctx.ipAddress,
      since,
    });
    if (ipFailures >= MAX_FAILED_LOGINS_PER_IP) {
      await audit(PLATFORM_EVENTS.LOGIN_BLOCKED, null, ctx);
      return { ok: false, error: "TOO_MANY_ATTEMPTS" };
    }
  }

  const user = await findPlatformUserCredentials(email);
  if (user) {
    // Restablecer la contraseña con el script desbloquea la cuenta: solo
    // cuentan los fallos posteriores.
    const lastReset = await findLatestAuthEventAt({
      action: PLATFORM_EVENTS.PASSWORD_RESET,
      target: { type: PLATFORM_USER_TARGET, id: user.id },
      since,
    });
    const accountFailures = await countRecentAuthEvents({
      action: PLATFORM_EVENTS.LOGIN_FAILED,
      actor: { type: "PLATFORM", id: user.id },
      since: lastReset ?? since,
    });
    if (accountFailures >= MAX_FAILED_LOGINS_PER_ACCOUNT) {
      await audit(PLATFORM_EVENTS.LOGIN_BLOCKED, user.id, ctx);
      return { ok: false, error: "TOO_MANY_ATTEMPTS" };
    }
  }

  let passwordOk = false;
  if (user) passwordOk = await verifyPassword(user.passwordHash, password);
  else await verifyAgainstDummy(password);

  // Cuenta inactiva: mismo error, para no revelar su estado.
  if (!user || !user.isActive || !passwordOk) {
    await audit(PLATFORM_EVENTS.LOGIN_FAILED, user?.id ?? null, ctx);
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  // Sesión pendiente del segundo paso: el ingreso se registra al verificar.
  const token = generateToken();
  const session = await createPlatformSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PLATFORM_MFA_PENDING_TTL_MS),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  return {
    ok: true,
    token,
    expiresAt: session.expiresAt,
    next: user.totpEnabledAt ? "VERIFY" : "ENROLL",
  };
}

// Solo sesiones verificadas. Renovación deslizante (como la del personal):
// solo escribe en BD cuando queda menos de la mitad de la duración.
export async function getPlatformSession(token: string): Promise<PlatformSessionDto | null> {
  if (!token) return null;
  const found = await findActivePlatformSession(hashToken(token));
  if (!found?.mfaVerifiedAt) return null;

  const now = Date.now();
  let expiresAt = found.expiresAt;
  if (expiresAt.getTime() - now < PLATFORM_SESSION_TTL_MS / 2) {
    expiresAt = new Date(now + PLATFORM_SESSION_TTL_MS);
    await extendPlatformSession(found.id, expiresAt, new Date(now));
  }
  const { id, name, email } = found.user;
  return { sessionId: found.id, expiresAt, user: { id, name, email } };
}

export type PlatformChallenge = {
  user: { id: string; name: string; email: string };
  // La cuenta ya tiene la verificación activada (pide el código) o la
  // activa ahora (muestra el QR).
  enrolled: boolean;
};

async function findChallenge(token: string): Promise<ActivePlatformSession | null> {
  if (!token) return null;
  const found = await findActivePlatformSession(hashToken(token));
  return found && !found.mfaVerifiedAt ? found : null;
}

// Sesión pendiente del segundo paso, o null.
export async function getPlatformChallenge(token: string): Promise<PlatformChallenge | null> {
  const found = await findChallenge(token);
  if (!found) return null;
  const { id, name, email, totpEnabledAt } = found.user;
  return { user: { id, name, email }, enrolled: totpEnabledAt !== null };
}

export type MfaError = "SESSION_EXPIRED" | "INVALID_CODE" | "TOO_MANY_ATTEMPTS";

// Códigos fallidos de la cuenta en la ventana; reiniciar la verificación
// con el script desbloquea.
async function mfaFailures(userId: string) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const lastReset = await findLatestAuthEventAt({
    action: PLATFORM_EVENTS.MFA_RESET,
    target: { type: PLATFORM_USER_TARGET, id: userId },
    since,
  });
  return countRecentAuthEvents({
    action: PLATFORM_EVENTS.MFA_FAILED,
    actor: { type: "PLATFORM", id: userId },
    since: lastReset ?? since,
  });
}

// Bloqueada: la sesión pendiente se cierra (hay que volver a la contraseña).
async function blockIfTooMany(session: ActivePlatformSession, ctx: RequestContext) {
  if ((await mfaFailures(session.user.id)) < MAX_FAILED_MFA_PER_ACCOUNT) return false;
  await revokePlatformSessionById(session.id);
  await audit(PLATFORM_EVENTS.MFA_BLOCKED, session.user.id, ctx);
  return true;
}

async function failCode(session: ActivePlatformSession, ctx: RequestContext): Promise<{ ok: false; error: MfaError }> {
  await audit(PLATFORM_EVENTS.MFA_FAILED, session.user.id, ctx);
  if (await blockIfTooMany(session, ctx)) return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  return { ok: false, error: "INVALID_CODE" };
}

async function finishLogin(session: ActivePlatformSession, now: Date, ctx: RequestContext) {
  await markPlatformUserLogin(session.user.id, now);
  await audit(PLATFORM_EVENTS.LOGIN_SUCCESS, session.user.id, ctx);
}

function sixDigits(code: unknown) {
  const clean = typeof code === "string" ? code.replace(/\s/g, "") : "";
  return /^\d{6}$/.test(clean) ? clean : null;
}

export type PlatformEnrollment = {
  // La clave en grupos de 4 para escribirla a mano en la app.
  secret: string;
  uri: string;
  qrSvg: string;
};

// Activación: la clave (nueva o la pendiente, para que el QR no cambie al
// recargar) con su QR. null si no hay sesión pendiente o ya está activada.
export async function startPlatformEnrollment(token: string): Promise<PlatformEnrollment | null> {
  const found = await findChallenge(token);
  if (!found || found.user.totpEnabledAt) return null;
  const key = getTotpEncryptionKey();
  const stored = await findPlatformUserTotp(found.user.id);
  let secret = stored?.totpSecret ? decryptSecret(stored.totpSecret, key) : null;
  if (!secret) {
    secret = generateTotpSecret();
    if (!(await savePendingTotpSecret(found.user.id, encryptSecret(secret, key)))) return null;
  }
  const uri = otpauthUri({ secret, account: found.user.email, issuer: PLATFORM_NAME });
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret: secret.replace(/(.{4})/g, "$1 ").trim(), uri, qrSvg };
}

export type EnrollResult = { ok: true; recoveryCodes: string[] } | { ok: false; error: MfaError };

// Confirma la activación con el primer código de la app. Devuelve los
// códigos de respaldo, que solo se muestran esta vez.
export async function confirmPlatformEnrollment(
  token: string,
  rawCode: unknown,
  ctx: RequestContext,
): Promise<EnrollResult> {
  const found = await findChallenge(token);
  if (!found || found.user.totpEnabledAt) return { ok: false, error: "SESSION_EXPIRED" };
  if (await blockIfTooMany(found, ctx)) return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  const stored = await findPlatformUserTotp(found.user.id);
  const code = sixDigits(rawCode);
  if (!stored?.totpSecret) return { ok: false, error: "SESSION_EXPIRED" };
  const now = new Date();
  const step = code
    ? verifyTotp(decryptSecret(stored.totpSecret, getTotpEncryptionKey()), code, { now, lastStep: null })
    : null;
  if (step === null) return failCode(found, ctx);

  const recoveryCodes = generateRecoveryCodes(PLATFORM_RECOVERY_CODE_COUNT);
  const result = await completePlatformMfa({
    userId: found.user.id,
    sessionId: found.id,
    expiresAt: new Date(now.getTime() + PLATFORM_SESSION_TTL_MS),
    now,
    step,
    enroll: { recoveryHashes: recoveryCodes.map(hashRecoveryCode) },
  });
  if (result !== "OK") return { ok: false, error: "SESSION_EXPIRED" };
  await audit(PLATFORM_EVENTS.MFA_ENROLLED, found.user.id, ctx);
  await finishLogin(found, now, ctx);
  return { ok: true, recoveryCodes };
}

export type VerifyResult =
  | { ok: true; recoveryCodesLeft: number | null }
  | { ok: false; error: MfaError };

// Segundo paso con el código de la app o con un código de respaldo.
// recoveryCodesLeft: cuántos quedan, solo si se usó uno.
export async function verifyPlatformMfa(
  token: string,
  input: { code?: unknown; recoveryCode?: unknown },
  ctx: RequestContext,
): Promise<VerifyResult> {
  const found = await findChallenge(token);
  if (!found || !found.user.totpEnabledAt) return { ok: false, error: "SESSION_EXPIRED" };
  if (await blockIfTooMany(found, ctx)) return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  const now = new Date();
  const base = {
    userId: found.user.id,
    sessionId: found.id,
    expiresAt: new Date(now.getTime() + PLATFORM_SESSION_TTL_MS),
    now,
  };

  let result;
  const usingRecovery = input.recoveryCode !== undefined;
  if (usingRecovery) {
    const raw = typeof input.recoveryCode === "string" ? normalizeRecoveryCode(input.recoveryCode) : "";
    if (!/^[A-Z0-9]{10}$/.test(raw)) return failCode(found, ctx);
    result = await completePlatformMfa({ ...base, recoveryHash: hashRecoveryCode(raw) });
  } else {
    const code = sixDigits(input.code);
    const stored = await findPlatformUserTotp(found.user.id);
    const step =
      code && stored?.totpSecret
        ? verifyTotp(decryptSecret(stored.totpSecret, getTotpEncryptionKey()), code, {
            now,
            lastStep: stored.totpLastStep,
          })
        : null;
    if (step === null) return failCode(found, ctx);
    result = await completePlatformMfa({ ...base, step });
  }
  if (result === "SESSION_GONE") return { ok: false, error: "SESSION_EXPIRED" };
  // Código ya usado (o el de respaldo no existe o ya se gastó).
  if (result === "CODE_REJECTED") return failCode(found, ctx);

  if (usingRecovery) await audit(PLATFORM_EVENTS.RECOVERY_CODE_USED, found.user.id, ctx);
  await finishLogin(found, now, ctx);
  return {
    ok: true,
    recoveryCodesLeft: usingRecovery ? await countUnusedRecoveryCodes(found.user.id) : null,
  };
}

// Cierra la sesión, verificada o pendiente.
export async function logoutPlatform(token: string, ctx: RequestContext): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  const found = await findActivePlatformSession(tokenHash);
  if (!found) return;
  await revokePlatformSession(tokenHash);
  await audit(PLATFORM_EVENTS.LOGOUT, found.user.id, ctx);
}
