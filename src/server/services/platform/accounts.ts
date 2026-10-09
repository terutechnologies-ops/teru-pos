import "server-only";

import { z } from "zod";

import { recordAuthEvent } from "@/server/data/auth-audit";
import { createPlatformUser, resetPlatformUserPassword } from "@/server/data/platform";
import { PLATFORM_EVENTS, PLATFORM_USER_TARGET } from "@/server/services/auth/config";
import { hashPassword } from "@/server/services/auth/passwords";
import {
  platformPasswordResetSchema,
  platformUserSchema,
  type PlatformUserInput,
} from "@/server/validations/platform";

// Alta y restablecimiento de cuentas del equipo Teru. Solo los usa el script
// de soporte teru:create-admin: no hay registro ni recuperación por correo.

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "valor"}: ${issue.message}`;
}

export type PlatformAccountResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function createPlatformAdmin(input: PlatformUserInput): Promise<PlatformAccountResult> {
  const parsed = platformUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { name, email, password } = parsed.data;

  const result = await createPlatformUser({ name, email, passwordHash: await hashPassword(password) });
  if (result.status === "EMAIL_TAKEN") {
    return { ok: false, error: "Ya existe una cuenta del equipo Teru con ese correo." };
  }
  await recordAuthEvent({
    companyId: null,
    actorType: "SYSTEM",
    actorId: null,
    action: PLATFORM_EVENTS.USER_CREATED,
    target: { type: PLATFORM_USER_TARGET, id: result.id },
  });
  return { ok: true, userId: result.id };
}

// Cambia la contraseña y cierra todas las sesiones de la cuenta.
export async function resetPlatformAdminPassword(input: {
  email: string;
  password: string;
}): Promise<
  { ok: true; userId: string; revokedSessions: number } | { ok: false; error: string }
> {
  const parsed = platformPasswordResetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const passwordHash = await hashPassword(parsed.data.password);
  const result = await resetPlatformUserPassword(parsed.data.email, passwordHash);
  if (!result) return { ok: false, error: "No existe una cuenta del equipo Teru con ese correo." };
  await recordAuthEvent({
    companyId: null,
    actorType: "SYSTEM",
    actorId: null,
    action: PLATFORM_EVENTS.PASSWORD_RESET,
    target: { type: PLATFORM_USER_TARGET, id: result.userId },
  });
  return { ok: true, userId: result.userId, revokedSessions: result.revokedSessions };
}
