import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  isStaffResetTokenValid,
  requestStaffPasswordReset,
  resetStaffPassword,
} from "@/server/services/auth/password-reset";
import { verifyPassword } from "@/server/services/auth/passwords";
import {
  getStaffSession,
  loginStaff,
} from "@/server/services/auth/staff-auth";
import { listDevOutbox } from "@/server/services/messaging/dev-outbox";

import {
  cleanupCompanies,
  createCompany,
  createUser,
  ctx,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("reset");
const OLD_PASSWORD = "Clave-Vieja-1";
let a: { id: string; slug: string };
let b: { id: string; slug: string };

beforeAll(async () => {
  a = await createCompany(`${tag}-a`, "Empresa A");
  b = await createCompany(`${tag}-b`, "Empresa B");
});
afterAll(() => cleanupCompanies(tag));

const lastToken = () =>
  listDevOutbox()[0]?.text.match(/token=([\w-]+)/)?.[1] ?? "";

const request = (email: string, ip = "1") =>
  requestStaffPasswordReset(a.slug, { email }, ctx(tag, ip));

const reset = (
  slug: string,
  token: string,
  password: string,
  confirmPassword = password,
) =>
  resetStaffPassword(slug, { token, password, confirmPassword }, ctx(tag));

describe("solicitud de recuperación", () => {
  it("responde igual si el correo no existe, sin enviar nada", async () => {
    const before = listDevOutbox().length;
    expect(await request(`nadie@${tag}.co`)).toEqual({ ok: true });
    expect(listDevOutbox().length).toBe(before);
    expect(await request("malo")).toEqual({
      ok: false,
      error: "INVALID_INPUT",
    });
  });

  it("envía un enlace con APP_URL; en BD solo queda el hash, con 20 min de vigencia", async () => {
    const user = await createUser({
      companyId: a.id,
      email: `envio@${tag}.co`,
      password: OLD_PASSWORD,
    });
    expect(await request(`ENVIO@${tag}.co`)).toEqual({ ok: true });

    const mail = listDevOutbox()[0];
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toContain("Empresa A");
    expect(mail.text).toContain(
      `http://localhost:3000/${a.slug}/restablecer?token=`,
    );

    const token = lastToken();
    const row = await db.userPasswordResetToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
    });
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      Math.abs(row.expiresAt.getTime() - Date.now() - 20 * 60e3),
    ).toBeLessThan(60e3);
    expect(await isStaffResetTokenValid(a.slug, token)).toBe(true);
    expect(await isStaffResetTokenValid(b.slug, token)).toBe(false);
  });

  it("un enlace nuevo invalida el anterior", async () => {
    await createUser({ companyId: a.id, email: `doble@${tag}.co` });
    await request(`doble@${tag}.co`);
    const first = lastToken();
    await request(`doble@${tag}.co`);
    const second = lastToken();
    expect(second).not.toBe(first);
    expect(await isStaffResetTokenValid(a.slug, first)).toBe(false);
    expect(await isStaffResetTokenValid(a.slug, second)).toBe(true);
  });

  it("límite por cuenta en silencio y por IP con error", async () => {
    await createUser({ companyId: a.id, email: `limite@${tag}.co` });
    const before = listDevOutbox().length;
    for (let i = 0; i < 4; i++) {
      expect(await request(`limite@${tag}.co`, `acc-${i}`)).toEqual({
        ok: true,
      });
    }
    expect(listDevOutbox().length).toBe(before + 3);

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => request(`z${i}@${tag}.co`, "ip-mala")),
    );
    expect(await request(`limite@${tag}.co`, "ip-mala")).toEqual({
      ok: false,
      error: "TOO_MANY_ATTEMPTS",
    });
  });
});

describe("restablecer contraseña", () => {
  it("valida la nueva contraseña y rechaza tokens ajenos o viejos", async () => {
    await createUser({ companyId: a.id, email: `valida@${tag}.co` });
    await request(`valida@${tag}.co`);
    const old = lastToken();
    await request(`valida@${tag}.co`);
    const token = lastToken();

    const short = await reset(a.slug, token, "corta");
    expect(short.ok === false && short.error === "INVALID_INPUT").toBe(true);
    const mismatch = await reset(a.slug, token, "Clave-Nueva-1", "otra");
    expect(
      mismatch.ok === false &&
        mismatch.error === "INVALID_INPUT" &&
        !!mismatch.fieldErrors.confirmPassword,
    ).toBe(true);
    expect(await reset(b.slug, token, "Clave-Nueva-1")).toEqual({
      ok: false,
      error: "INVALID_TOKEN",
    });
    expect(await reset(a.slug, old, "Clave-Nueva-1")).toEqual({
      ok: false,
      error: "INVALID_TOKEN",
    });
    expect(await isStaffResetTokenValid(a.slug, token)).toBe(true);
  });

  it("cambia la contraseña una sola vez, revoca sesiones y desbloquea la cuenta", async () => {
    const email = `cambio@${tag}.co`;
    const user = await createUser({
      companyId: a.id,
      email,
      password: OLD_PASSWORD,
    });
    const session = await loginStaff(
      a.slug,
      { email, password: OLD_PASSWORD },
      ctx(tag, "pc"),
    );
    if (!session.ok) throw new Error(session.error);
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        loginStaff(a.slug, { email, password: "mala" }, ctx(tag, `f${i}`)),
      ),
    );

    await request(email, "cambio");
    const token = lastToken();

    // Dos envíos simultáneos con el mismo token: solo uno gana.
    const results = await Promise.all([
      reset(a.slug, token, "Clave-Nueva-1"),
      reset(a.slug, token, "Clave-Otra-22"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const winner = results[0].ok ? "Clave-Nueva-1" : "Clave-Otra-22";

    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(updated.passwordHash, winner)).toBe(true);
    expect(await getStaffSession(a.slug, session.token)).toBeNull();
    expect(await isStaffResetTokenValid(a.slug, token)).toBe(false);

    const after = await loginStaff(
      a.slug,
      { email, password: winner },
      ctx(tag, "despues"),
    );
    expect(after.ok).toBe(true);
    const old = await loginStaff(
      a.slug,
      { email, password: OLD_PASSWORD },
      ctx(tag, "despues"),
    );
    expect(old.ok).toBe(false);

    expect(
      await db.authAuditLog.count({
        where: { actorId: user.id, action: "PASSWORD_RESET_COMPLETED" },
      }),
    ).toBe(1);
  });
});
