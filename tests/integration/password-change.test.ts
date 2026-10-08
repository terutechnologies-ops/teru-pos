import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { AUTH_EVENTS } from "@/server/services/auth/config";
import {
  changeOwnPassword,
  PASSWORD_CHANGE_BLOCKED_MESSAGE,
} from "@/server/services/auth/password-change";
import { getStaffSession, loginStaff } from "@/server/services/auth/staff-auth";
import { setMessageSenderForTesting } from "@/server/services/messaging";
import { listDevOutbox } from "@/server/services/messaging/dev-outbox";

import { cleanupCompanies, createCompany, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("pwchange");
const PASSWORD = "Clave-Segura-1";
let a: { id: string; slug: string };
let b: { id: string; slug: string };

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => {
  setMessageSenderForTesting(null);
  return cleanupCompanies(tag);
});

// Persona nueva por prueba (el límite de intentos es por persona).
async function person(name: string, company = a) {
  const email = `${name}@${tag}.co`;
  await createUser({ companyId: company.id, email, role: "CASHIER", name });
  return email;
}

async function login(email: string, password = PASSWORD, company = a) {
  const result = await loginStaff(company.slug, { email, password, remember: false }, ctx(tag));
  return result.ok ? result.token : null;
}

async function sessionOf(token: string, company = a): Promise<StaffSessionDto> {
  const found = await getStaffSession(company.slug, token);
  if (!found) throw new Error("Sesión no encontrada");
  return found.session;
}

const change = (session: StaffSessionDto, input: Partial<Record<string, string>>) =>
  changeOwnPassword(
    session,
    {
      currentPassword: PASSWORD,
      password: "Nueva-Clave-9",
      confirmPassword: "Nueva-Clave-9",
      ...input,
    },
    ctx(tag),
  );

describe("cambiar la propia contraseña", () => {
  it("valida la contraseña actual, la nueva y la confirmación", async () => {
    const session = await sessionOf((await login(await person("val")))!);
    expect(await change(session, { currentPassword: "" })).toMatchObject({
      ok: false,
      fieldErrors: { currentPassword: "Escribe tu contraseña actual." },
    });
    expect(await change(session, { password: "corta", confirmPassword: "corta" })).toMatchObject({
      ok: false,
      fieldErrors: { password: "La contraseña debe tener al menos 8 caracteres." },
    });
    expect(await change(session, { confirmPassword: "Otra-Clave-9" })).toMatchObject({
      ok: false,
      fieldErrors: { confirmPassword: "Las contraseñas no coinciden." },
    });
    expect(await change(session, { currentPassword: "mala-clave" })).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "La contraseña actual no es correcta." },
    });
    expect(
      await change(session, { password: PASSWORD, confirmPassword: PASSWORD }),
    ).toEqual({
      ok: false,
      fieldErrors: { password: "La nueva contraseña debe ser distinta de la actual." },
    });
    // Nada cambió: sigue entrando con la de siempre y no hubo aviso.
    expect(await login(`val@${tag}.co`)).not.toBeNull();
    expect(listDevOutbox().some((entry) => entry.to === `val@${tag}.co`)).toBe(false);
  });

  it("cambia la contraseña, mantiene esta sesión, cierra las demás e invalida los enlaces pendientes", async () => {
    const email = await person("ok");
    const here = (await login(email))!;
    const other1 = (await login(email))!;
    const other2 = (await login(email))!;
    const session = await sessionOf(here);
    // Un enlace de recuperación pedido antes del cambio.
    const pending = await db.userPasswordResetToken.create({
      data: {
        userId: session.user.id,
        tokenHash: `${tag}-pendiente`.padEnd(64, "0"),
        expiresAt: new Date(Date.now() + 20 * 60_000),
      },
    });

    expect(await change(session, {})).toEqual({ ok: true, closedSessions: 2 });
    const token = await db.userPasswordResetToken.findUniqueOrThrow({ where: { id: pending.id } });
    expect(token.usedAt).not.toBeNull();

    expect(await getStaffSession(a.slug, here)).not.toBeNull();
    expect(await getStaffSession(a.slug, other1)).toBeNull();
    expect(await getStaffSession(a.slug, other2)).toBeNull();
    expect(await login(email)).toBeNull();
    expect(await login(email, "Nueva-Clave-9")).not.toBeNull();

    const events = await db.authAuditLog.findMany({
      where: { companyId: a.id, actorId: session.user.id, action: AUTH_EVENTS.PASSWORD_CHANGED },
    });
    expect(events).toHaveLength(1);

    // Aviso de seguridad a la persona, con el botón para recuperarla.
    const notice = listDevOutbox().find((entry) => entry.to === email);
    expect(notice?.subject).toContain("cambió");
    expect(notice?.text).toContain("Desde Mi cuenta");
    expect(notice?.html).toContain(`/${a.slug}/recuperar`);
  });

  it("si el aviso no se puede enviar, el cambio igual queda hecho", async () => {
    const email = await person("sinaviso");
    const session = await sessionOf((await login(email))!);
    setMessageSenderForTesting({
      sendEmail: async () => {
        throw new Error("proveedor caído");
      },
    });
    try {
      expect(await change(session, {})).toEqual({ ok: true, closedSessions: 0 });
    } finally {
      setMessageSenderForTesting(null);
    }
    expect(await login(email, "Nueva-Clave-9")).not.toBeNull();
  });

  it("bloquea tras 5 contraseñas actuales incorrectas", async () => {
    const email = await person("bloq");
    const session = await sessionOf((await login(email))!);
    for (let i = 0; i < 5; i++) {
      expect(await change(session, { currentPassword: `mala-${i}` })).toMatchObject({
        ok: false,
        fieldErrors: { currentPassword: expect.any(String) },
      });
    }
    // Aun con la correcta, espera la ventana.
    expect(await change(session, {})).toEqual({
      ok: false,
      error: PASSWORD_CHANGE_BLOCKED_MESSAGE,
      fieldErrors: {},
    });
    expect(await login(email)).not.toBeNull();
  });

  it("solo cambia la contraseña de la persona de la sesión, en su empresa", async () => {
    const mine = await person("mia");
    // Mismo correo en otra empresa: es otra cuenta.
    await createUser({ companyId: b.id, email: mine, role: "CASHIER" });
    const session = await sessionOf((await login(mine))!);

    expect(await change(session, {})).toMatchObject({ ok: true });
    expect(await login(mine, PASSWORD, b)).not.toBeNull();

    // Una sesión con la persona de A y la empresa B no encuentra a nadie.
    const forged: StaffSessionDto = { ...session, company: { ...session.company, id: b.id } };
    const before = await db.user.findFirstOrThrow({ where: { companyId: b.id, email: mine } });
    expect(
      await change(forged, {
        currentPassword: "Nueva-Clave-9",
        password: "Otra-Clave-77",
        confirmPassword: "Otra-Clave-77",
      }),
    ).toEqual({ ok: false, error: "Tu cuenta ya no está activa.", fieldErrors: {} });
    const after = await db.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("una persona desactivada no puede cambiarla", async () => {
    const email = await person("off");
    const session = await sessionOf((await login(email))!);
    await db.user.update({ where: { id: session.user.id }, data: { isActive: false } });
    expect(await change(session, {})).toEqual({
      ok: false,
      error: "Tu cuenta ya no está activa.",
      fieldErrors: {},
    });
  });
});
