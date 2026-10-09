import "server-only";

import type { RequestContext } from "@/server/dto/auth";
import {
  countRecentAuthEvents,
  findLatestAuthEventAt,
  recordAuthEvent,
} from "@/server/data/auth-audit";
import {
  createPlatformSession,
  extendPlatformSession,
  findActivePlatformSession,
  findPlatformUserCredentials,
  markPlatformUserLogin,
  revokePlatformSession,
} from "@/server/data/platform";
import {
  LOGIN_WINDOW_MS,
  MAX_FAILED_LOGINS_PER_ACCOUNT,
  MAX_FAILED_LOGINS_PER_IP,
  PLATFORM_EVENTS,
  PLATFORM_SESSION_TTL_MS,
  PLATFORM_USER_TARGET,
} from "@/server/services/auth/config";
import { verifyAgainstDummy, verifyPassword } from "@/server/services/auth/passwords";
import { generateToken, hashToken } from "@/server/services/auth/tokens";
import { platformLoginSchema } from "@/server/validations/platform";

// Login del equipo Teru (panel /teru). Mismo esquema que el del personal
// (sesiones propias en BD, token en cookie, hash en BD, límite de intentos)
// pero sin empresa: estas sesiones no dan acceso a ninguna empresa.

export type PlatformSessionDto = {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string };
};

export type PlatformLoginError = "INVALID_INPUT" | "INVALID_CREDENTIALS" | "TOO_MANY_ATTEMPTS";

export type PlatformLoginResult =
  | { ok: true; token: string; expiresAt: Date }
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

  const token = generateToken();
  const now = new Date();
  const session = await createPlatformSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + PLATFORM_SESSION_TTL_MS),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  await markPlatformUserLogin(user.id, now);
  await audit(PLATFORM_EVENTS.LOGIN_SUCCESS, user.id, ctx);
  return { ok: true, token, expiresAt: session.expiresAt };
}

// Renovación deslizante (como la del personal): solo escribe en BD cuando
// queda menos de la mitad de la duración.
export async function getPlatformSession(token: string): Promise<PlatformSessionDto | null> {
  if (!token) return null;
  const found = await findActivePlatformSession(hashToken(token));
  if (!found) return null;

  const now = Date.now();
  let expiresAt = found.expiresAt;
  if (expiresAt.getTime() - now < PLATFORM_SESSION_TTL_MS / 2) {
    expiresAt = new Date(now + PLATFORM_SESSION_TTL_MS);
    await extendPlatformSession(found.id, expiresAt, new Date(now));
  }
  return { sessionId: found.id, expiresAt, user: found.user };
}

export async function logoutPlatform(token: string, ctx: RequestContext): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  const found = await findActivePlatformSession(tokenHash);
  if (!found) return;
  await revokePlatformSession(tokenHash);
  await audit(PLATFORM_EVENTS.LOGOUT, found.user.id, ctx);
}
