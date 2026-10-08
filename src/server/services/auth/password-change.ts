import "server-only";

import { z } from "zod";

import {
  countRecentAuthEvents,
  findLatestAuthEventAt,
  recordAuthEvent,
} from "@/server/data/auth-audit";
import { changeUserPassword, findUserPasswordHash } from "@/server/data/users";
import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { passwordChangeSchema, type PasswordChangeInput } from "@/server/validations/auth";

import { AUTH_EVENTS, MAX_FAILED_PASSWORD_CHANGES, PASSWORD_CHANGE_WINDOW_MS } from "./config";
import { sendPasswordChangedNotice } from "./password-notice";
import { hashPassword, verifyPassword } from "./passwords";

// Cambio de la propia contraseña desde "Mi cuenta" (cualquier rol). Pide la
// actual, con límite de intentos fallidos, y cierra las demás sesiones de
// la persona; la actual sigue abierta. Después le avisa por correo.

export type PasswordChangeField = keyof PasswordChangeInput;

export type PasswordChangeResult =
  | { ok: true; closedSessions: number }
  | { ok: false; error?: string; fieldErrors: Partial<Record<PasswordChangeField, string>> };

export const PASSWORD_CHANGE_BLOCKED_MESSAGE =
  "Demasiados intentos con la contraseña actual. Espera 15 minutos e inténtalo de nuevo.";

export async function changeOwnPassword(
  session: StaffSessionDto,
  rawInput: PasswordChangeInput,
  ctx: RequestContext,
): Promise<PasswordChangeResult> {
  const parsed = passwordChangeSchema.safeParse(rawInput);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([field, errors]) => [field, (errors as string[])[0]]),
      ),
    };
  }

  const companyId = session.company.id;
  const actor = { type: "STAFF" as const, id: session.user.id };
  const audit = (action: string) =>
    recordAuthEvent({
      companyId,
      actorType: "STAFF",
      actorId: session.user.id,
      action,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

  // Solo cuentan los fallos posteriores al último cambio exitoso.
  const since = new Date(Date.now() - PASSWORD_CHANGE_WINDOW_MS);
  const lastChange = await findLatestAuthEventAt({
    action: AUTH_EVENTS.PASSWORD_CHANGED,
    actor,
    since,
  });
  const failures = await countRecentAuthEvents({
    action: AUTH_EVENTS.PASSWORD_CHANGE_FAILED,
    actor,
    since: lastChange ?? since,
  });
  if (failures >= MAX_FAILED_PASSWORD_CHANGES) {
    await audit(AUTH_EVENTS.PASSWORD_CHANGE_BLOCKED);
    return { ok: false, error: PASSWORD_CHANGE_BLOCKED_MESSAGE, fieldErrors: {} };
  }

  const currentHash = await findUserPasswordHash(companyId, session.user.id);
  if (!currentHash) {
    return { ok: false, error: "Tu cuenta ya no está activa.", fieldErrors: {} };
  }
  const { currentPassword, password } = parsed.data;
  if (!(await verifyPassword(currentHash, currentPassword))) {
    await audit(AUTH_EVENTS.PASSWORD_CHANGE_FAILED);
    return {
      ok: false,
      fieldErrors: { currentPassword: "La contraseña actual no es correcta." },
    };
  }
  if (await verifyPassword(currentHash, password)) {
    return {
      ok: false,
      fieldErrors: { password: "La nueva contraseña debe ser distinta de la actual." },
    };
  }

  // Hash fuera de la transacción: argon2 tarda y no debe retener la conexión.
  const closedSessions = await changeUserPassword({
    companyId,
    userId: session.user.id,
    passwordHash: await hashPassword(password),
    keepSessionId: session.sessionId,
  });
  if (closedSessions === null) {
    return { ok: false, error: "Tu cuenta ya no está activa.", fieldErrors: {} };
  }
  await audit(AUTH_EVENTS.PASSWORD_CHANGED);
  await sendPasswordChangedNotice({ companyId, userId: session.user.id, via: "ACCOUNT" });
  return { ok: true, closedSessions };
}
