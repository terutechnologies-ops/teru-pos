import "server-only";

import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import {
  countRecentAuthEvents,
  recordAuthEvent,
} from "@/server/data/auth-audit";
import { findActiveCompanyBySlug } from "@/server/data/companies";
import {
  createUserSession,
  extendUserSession,
  findActiveUserSession,
  revokeUserSession,
} from "@/server/data/user-sessions";
import {
  findUserCredentialsByEmail,
  markUserLoggedIn,
} from "@/server/data/users";
import { companySlugSchema, staffLoginSchema } from "@/server/validations/auth";

import {
  AUTH_EVENTS,
  LOGIN_WINDOW_MS,
  MAX_FAILED_LOGINS_PER_ACCOUNT,
  MAX_FAILED_LOGINS_PER_IP,
  PERSISTENT_SESSION_TTL_MS,
  SESSION_TTL_MS,
} from "./config";
import { verifyAgainstDummy, verifyPassword } from "./passwords";
import { generateToken, hashToken } from "./tokens";

export type StaffLoginError =
  | "INVALID_INPUT"
  | "COMPANY_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "TOO_MANY_ATTEMPTS";

export type StaffLoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: StaffLoginError };

async function resolveCompany(companySlug: string) {
  const slug = companySlugSchema.safeParse(companySlug);
  if (!slug.success) return null;
  return findActiveCompanyBySlug(slug.data);
}

function sessionTtl(persistent: boolean) {
  return persistent ? PERSISTENT_SESSION_TTL_MS : SESSION_TTL_MS;
}

export async function loginStaff(
  companySlug: string,
  rawInput: unknown,
  ctx: RequestContext,
): Promise<StaffLoginResult> {
  const input = staffLoginSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "INVALID_INPUT" };
  const { email, password, remember } = input.data;

  const company = await resolveCompany(companySlug);
  if (!company) return { ok: false, error: "COMPANY_NOT_FOUND" };

  const audit = (action: string, actorId: string | null) =>
    recordAuthEvent({
      companyId: company.id,
      actorType: "STAFF",
      actorId,
      action,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);

  if (ctx.ipAddress) {
    const ipFailures = await countRecentAuthEvents({
      action: AUTH_EVENTS.LOGIN_FAILED,
      ipAddress: ctx.ipAddress,
      since,
    });
    if (ipFailures >= MAX_FAILED_LOGINS_PER_IP) {
      await audit(AUTH_EVENTS.LOGIN_BLOCKED, null);
      return { ok: false, error: "TOO_MANY_ATTEMPTS" };
    }
  }

  const user = await findUserCredentialsByEmail(company.id, email);

  if (user) {
    const accountFailures = await countRecentAuthEvents({
      action: AUTH_EVENTS.LOGIN_FAILED,
      actorId: user.id,
      since,
    });
    if (accountFailures >= MAX_FAILED_LOGINS_PER_ACCOUNT) {
      await audit(AUTH_EVENTS.LOGIN_BLOCKED, user.id);
      return { ok: false, error: "TOO_MANY_ATTEMPTS" };
    }
  }

  let passwordOk = false;
  if (user) {
    passwordOk = await verifyPassword(user.passwordHash, password);
  } else {
    await verifyAgainstDummy(password);
  }

  // Usuario inactivo: mismo error que credenciales inválidas, para no
  // revelar el estado de la cuenta.
  if (!user || !user.isActive || !passwordOk) {
    await audit(AUTH_EVENTS.LOGIN_FAILED, user?.id ?? null);
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  const token = generateToken();
  const now = new Date();
  const session = await createUserSession({
    userId: user.id,
    companyId: company.id,
    tokenHash: hashToken(token),
    persistent: remember,
    expiresAt: new Date(now.getTime() + sessionTtl(remember)),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  await markUserLoggedIn(user.id, company.id, now);
  await audit(AUTH_EVENTS.LOGIN_SUCCESS, user.id);

  return { ok: true, token, expiresAt: session.expiresAt };
}

export type StaffSessionResult = {
  session: StaffSessionDto;
  // true si se extendió el vencimiento: quien llama debe reenviar la cookie
  // con el nuevo expiresAt.
  renewed: boolean;
};

// Renovación deslizante: solo se escribe en BD cuando queda menos de la
// mitad de la duración, para no actualizar la sesión en cada request.
export async function getStaffSession(
  companySlug: string,
  token: string,
): Promise<StaffSessionResult | null> {
  if (!token) return null;
  const company = await resolveCompany(companySlug);
  if (!company) return null;

  const found = await findActiveUserSession(hashToken(token), company.id);
  if (!found) return null;

  const now = Date.now();
  const ttl = sessionTtl(found.persistent);
  let expiresAt = found.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - now < ttl / 2) {
    expiresAt = new Date(now + ttl);
    await extendUserSession(found.id, company.id, expiresAt, new Date(now));
    renewed = true;
  }

  return {
    session: {
      sessionId: found.id,
      expiresAt,
      user: found.user,
      company,
    },
    renewed,
  };
}

export async function logoutStaff(
  companySlug: string,
  token: string,
  ctx: RequestContext,
): Promise<void> {
  if (!token) return;
  const company = await resolveCompany(companySlug);
  if (!company) return;

  const tokenHash = hashToken(token);
  const found = await findActiveUserSession(tokenHash, company.id);
  if (!found) return;

  await revokeUserSession(tokenHash, company.id);
  await recordAuthEvent({
    companyId: company.id,
    actorType: "STAFF",
    actorId: found.user.id,
    action: AUTH_EVENTS.LOGOUT,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}
