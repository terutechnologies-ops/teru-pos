import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/server/dto/auth";
import {
  countRecentAuthEvents,
  recordAuthEvent,
} from "@/server/data/auth-audit";
import {
  findValidUserResetToken,
  replaceUserResetToken,
  resetUserPasswordWithToken,
} from "@/server/data/password-reset-tokens";
import { findUserCredentialsByEmail } from "@/server/data/users";
import { getAppUrl } from "@/server/env";
import { getActiveCompanyBySlug } from "@/server/services/companies";
import { getMessageSender } from "@/server/services/messaging";
import {
  passwordResetRequestSchema,
  passwordResetSchema,
} from "@/server/validations/auth";

import {
  AUTH_EVENTS,
  MAX_RESET_REQUESTS_PER_ACCOUNT,
  MAX_RESET_REQUESTS_PER_IP,
  RESET_TOKEN_TTL_MS,
  RESET_WINDOW_MS,
} from "./config";
import { hashPassword } from "./passwords";
import { generateToken, hashToken } from "./tokens";

export type PasswordResetRequestResult =
  | { ok: true }
  | {
      ok: false;
      error: "INVALID_INPUT" | "COMPANY_NOT_FOUND" | "TOO_MANY_ATTEMPTS";
    };

// La respuesta es la misma exista o no la cuenta: nunca revela qué correos
// están registrados. El límite por cuenta también se aplica en silencio.
export async function requestStaffPasswordReset(
  companySlug: string,
  rawInput: unknown,
  ctx: RequestContext,
): Promise<PasswordResetRequestResult> {
  const input = passwordResetRequestSchema.safeParse(rawInput);
  if (!input.success) return { ok: false, error: "INVALID_INPUT" };

  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { ok: false, error: "COMPANY_NOT_FOUND" };

  // Antes de buscar la cuenta: si falta configuración, falla igual para
  // todos los correos (no revela cuáles existen) y no deja tokens sin enviar.
  const sender = getMessageSender();
  const appUrl = getAppUrl();

  const audit = (action: string, actorId: string | null) =>
    recordAuthEvent({
      companyId: company.id,
      actorType: "STAFF",
      actorId,
      action,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  const since = new Date(Date.now() - RESET_WINDOW_MS);

  if (ctx.ipAddress) {
    const ipRequests = await countRecentAuthEvents({
      action: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
      ipAddress: ctx.ipAddress,
      since,
    });
    if (ipRequests >= MAX_RESET_REQUESTS_PER_IP) {
      await audit(AUTH_EVENTS.PASSWORD_RESET_BLOCKED, null);
      return { ok: false, error: "TOO_MANY_ATTEMPTS" };
    }
  }

  const user = await findUserCredentialsByEmail(company.id, input.data.email);
  if (!user || !user.isActive) {
    await audit(AUTH_EVENTS.PASSWORD_RESET_REQUESTED, null);
    return { ok: true };
  }

  const accountRequests = await countRecentAuthEvents({
    action: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
    actorId: user.id,
    since,
  });
  if (accountRequests >= MAX_RESET_REQUESTS_PER_ACCOUNT) {
    await audit(AUTH_EVENTS.PASSWORD_RESET_BLOCKED, user.id);
    return { ok: true };
  }

  const token = generateToken();
  await replaceUserResetToken({
    userId: user.id,
    companyId: company.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  await audit(AUTH_EVENTS.PASSWORD_RESET_REQUESTED, user.id);

  const link = `${appUrl}/${company.slug}/restablecer?token=${token}`;
  const minutes = RESET_TOKEN_TTL_MS / 60_000;
  await sender.sendEmail({
    to: user.email,
    subject: `Restablece tu contraseña de ${company.name}`,
    text: [
      `Hola ${user.name},`,
      "",
      `Recibimos una solicitud para restablecer tu contraseña en ${company.name}.`,
      `Abre este enlace para crear una nueva (vence en ${minutes} minutos):`,
      "",
      link,
      "",
      "Si no la solicitaste, ignora este correo: tu contraseña no cambiará.",
    ].join("\n"),
  });

  return { ok: true };
}

export async function isStaffResetTokenValid(
  companySlug: string,
  token: string,
): Promise<boolean> {
  if (!token) return false;
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return false;
  return (await findValidUserResetToken(hashToken(token), company.id)) !== null;
}

export type PasswordResetResult =
  | { ok: true; companySlug: string }
  | {
      ok: false;
      error: "INVALID_INPUT";
      fieldErrors: { password?: string; confirmPassword?: string };
    }
  | { ok: false; error: "INVALID_TOKEN" };

export async function resetStaffPassword(
  companySlug: string,
  rawInput: unknown,
  ctx: RequestContext,
): Promise<PasswordResetResult> {
  const input = passwordResetSchema.safeParse(rawInput);
  if (!input.success) {
    const { fieldErrors } = z.flattenError(input.error);
    if (fieldErrors.token) return { ok: false, error: "INVALID_TOKEN" };
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: {
        password: fieldErrors.password?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0],
      },
    };
  }

  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { ok: false, error: "INVALID_TOKEN" };

  // Hash fuera de la transacción: argon2 tarda y no debe retener la conexión.
  const passwordHash = await hashPassword(input.data.password);
  const userId = await resetUserPasswordWithToken({
    tokenHash: hashToken(input.data.token),
    companyId: company.id,
    passwordHash,
  });
  if (!userId) return { ok: false, error: "INVALID_TOKEN" };

  await recordAuthEvent({
    companyId: company.id,
    actorType: "STAFF",
    actorId: userId,
    action: AUTH_EVENTS.PASSWORD_RESET_COMPLETED,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  return { ok: true, companySlug: company.slug };
}
