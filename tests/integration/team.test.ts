import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import { listDevOutbox } from "@/server/services/messaging/dev-outbox";
import {
  acceptInvitation,
  getInvitationPreview,
  getTeam,
  inviteStaffMember,
  resendStaffInvitation,
  revokeInvitation,
  setStaffMemberActive,
} from "@/server/services/team";

import {
  cleanupCompanies,
  createCompany,
  createUser,
  ctx,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("team");
const context = ctx(tag);
const PASSWORD = "Clave-Nueva-9";

type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let owner: { id: string; email: string };
let ownerSession: StaffSessionDto;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  owner = await createUser({ companyId: a.id, email: `owner@${tag}.co`, role: "OWNER" });
  ownerSession = sessionFor(a, owner.id, "OWNER");
});
afterAll(() => cleanupCompanies(tag));

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Dueña Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null },
  };
}

// Token del último correo enviado a esa dirección (outbox de desarrollo).
function lastTokenFor(email: string) {
  const message = listDevOutbox().find((entry) => entry.to === email);
  const token = message?.text.match(/invitacion\?token=(\S+)/)?.[1];
  if (!token) throw new Error(`No hay invitación para ${email}`);
  return token;
}

async function pendingInvitationId(email: string, companyId = a.id) {
  const invitation = await db.staffInvitation.findFirstOrThrow({
    where: { companyId, email, acceptedAt: null, revokedAt: null },
  });
  return invitation.id;
}

const accept = (token: string, slug = a.slug) =>
  acceptInvitation(slug, { token, password: PASSWORD, confirmPassword: PASSWORD }, context);

describe("invitar y aceptar", () => {
  it("envía el enlace, muestra la invitación y crea la cuenta con el rol", async () => {
    const email = `carlos@${tag}.co`;
    expect(
      await inviteStaffMember(
        ownerSession,
        { name: " Carlos Méndez ", email: email.toUpperCase(), role: "ADMIN" },
        context,
      ),
    ).toEqual({ ok: true });

    const token = lastTokenFor(email);
    expect(await getInvitationPreview(a.slug, token)).toEqual({
      name: "Carlos Méndez",
      email,
      role: "ADMIN",
    });
    // El token no sirve en otra empresa.
    expect(await getInvitationPreview(b.slug, token)).toBeNull();

    expect(await accept(token)).toEqual({ ok: true, companySlug: a.slug });
    const user = await db.user.findUniqueOrThrow({
      where: { companyId_email: { companyId: a.id, email } },
    });
    expect(user).toMatchObject({ name: "Carlos Méndez", role: "ADMIN", isActive: true });

    // Un solo uso.
    expect(await accept(token)).toEqual({ ok: false, error: "INVALID_TOKEN" });
    expect(await getInvitationPreview(a.slug, token)).toBeNull();
  });

  it("rechaza datos inválidos, roles no invitables y correos con cuenta", async () => {
    const invalid = await inviteStaffMember(
      ownerSession,
      { name: "A", email: "no-es-correo", role: "OWNER" },
      context,
    );
    expect(invalid).toEqual({
      ok: false,
      fieldErrors: {
        name: expect.any(String),
        email: "Escribe un correo válido.",
        role: "Elige un rol.",
      },
    });

    const taken = await inviteStaffMember(
      ownerSession,
      { name: "Otra vez", email: owner.email, role: "STAFF" },
      context,
    );
    expect(taken).toEqual({ ok: false, fieldErrors: { email: expect.any(String) } });
    expect(
      await db.staffInvitation.count({ where: { companyId: a.id, email: owner.email } }),
    ).toBe(0);
  });

  it("valida la contraseña sin consumir la invitación", async () => {
    const email = `valida@${tag}.co`;
    await inviteStaffMember(ownerSession, { name: "Valida", email, role: "STAFF" }, context);
    const token = lastTokenFor(email);

    const result = await acceptInvitation(
      a.slug,
      { token, password: "corta", confirmPassword: "otra" },
      context,
    );
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(await getInvitationPreview(a.slug, token)).not.toBeNull();
  });
});

describe("reenviar y revocar", () => {
  it("reenviar invalida el enlace anterior y deja uno nuevo", async () => {
    const email = `reenvio@${tag}.co`;
    await inviteStaffMember(ownerSession, { name: "Reenvío", email, role: "STAFF" }, context);
    const first = lastTokenFor(email);

    const id = await pendingInvitationId(email);
    expect(await resendStaffInvitation(ownerSession, id, context)).toEqual({ ok: true });
    const second = lastTokenFor(email);

    expect(second).not.toBe(first);
    expect(await getInvitationPreview(a.slug, first)).toBeNull();
    expect(await getInvitationPreview(a.slug, second)).toMatchObject({ email });
  });

  it("revocar deja el enlace sin efecto y no se repite", async () => {
    const email = `revoca@${tag}.co`;
    await inviteStaffMember(ownerSession, { name: "Revoca", email, role: "STAFF" }, context);
    const token = lastTokenFor(email);
    const id = await pendingInvitationId(email);

    expect(await revokeInvitation(ownerSession, id, context)).toEqual({ ok: true });
    expect(await getInvitationPreview(a.slug, token)).toBeNull();
    expect(await revokeInvitation(ownerSession, id, context)).toMatchObject({ ok: false });
    expect(await resendStaffInvitation(ownerSession, id, context)).toMatchObject({
      ok: false,
    });
  });

  it("no toca invitaciones de otra empresa", async () => {
    const otherOwner = await createUser({
      companyId: b.id,
      email: `owner-b@${tag}.co`,
      role: "OWNER",
    });
    const email = `ajena@${tag}.co`;
    await inviteStaffMember(
      sessionFor(b, otherOwner.id, "OWNER"),
      { name: "Ajena", email, role: "STAFF" },
      context,
    );
    const id = await pendingInvitationId(email, b.id);

    expect(await revokeInvitation(ownerSession, id, context)).toMatchObject({ ok: false });
    expect(await resendStaffInvitation(ownerSession, id, context)).toMatchObject({
      ok: false,
    });
    const team = await getTeam(ownerSession);
    expect(team.invitations.map((i) => i.email)).not.toContain(email);
  });
});

describe("activar y desactivar miembros", () => {
  it("desactivar revoca sesiones y reactivar devuelve el acceso", async () => {
    const member = await createUser({ companyId: a.id, email: `activo@${tag}.co` });
    await db.userSession.create({
      data: {
        userId: member.id,
        companyId: a.id,
        tokenHash: `${tag}-sesion`,
        expiresAt: new Date(Date.now() + 3600e3),
      },
    });

    expect(await setStaffMemberActive(ownerSession, member.id, false, context)).toEqual({
      ok: true,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({
      isActive: false,
    });
    expect(
      await db.userSession.count({ where: { userId: member.id, revokedAt: null } }),
    ).toBe(0);
    // Repetir no cambia nada.
    expect(await setStaffMemberActive(ownerSession, member.id, false, context)).toMatchObject({
      ok: false,
    });

    const team = await getTeam(ownerSession);
    expect(team.members.find((m) => m.id === member.id)).toMatchObject({ isActive: false });
    expect(team.members.find((m) => m.id === owner.id)).toMatchObject({ isSelf: true });

    expect(await setStaffMemberActive(ownerSession, member.id, true, context)).toEqual({
      ok: true,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({
      isActive: true,
    });
  });

  it("no permite cambiar al propietario, a uno mismo ni a otra empresa", async () => {
    const secondOwner = await createUser({
      companyId: a.id,
      email: `owner2@${tag}.co`,
      role: "OWNER",
    });
    const outsider = await createUser({ companyId: b.id, email: `fuera@${tag}.co` });

    for (const userId of [owner.id, secondOwner.id, outsider.id]) {
      expect(await setStaffMemberActive(ownerSession, userId, false, context)).toMatchObject({
        ok: false,
      });
    }
    const users = await db.user.findMany({
      where: { id: { in: [owner.id, secondOwner.id, outsider.id] } },
    });
    expect(users.every((user) => user.isActive)).toBe(true);
  });
});

describe("autorización", () => {
  it("solo quien tiene team.manage gestiona el equipo", async () => {
    for (const role of ["STAFF"] as const) {
      const session = sessionFor(a, "otro", role);
      await expect(getTeam(session)).rejects.toThrow(ForbiddenError);
      await expect(
        inviteStaffMember(session, { name: "X Y", email: `x@${tag}.co`, role: "STAFF" }, context),
      ).rejects.toThrow(ForbiddenError);
      await expect(revokeInvitation(session, "id", context)).rejects.toThrow(ForbiddenError);
      await expect(resendStaffInvitation(session, "id", context)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(setStaffMemberActive(session, owner.id, false, context)).rejects.toThrow(
        ForbiddenError,
      );
    }
  });
});

describe("administrador: solo gestiona al Personal", () => {
  let admin: { id: string };
  let adminSession: StaffSessionDto;
  let otherAdmin: { id: string };
  let staff: { id: string };

  beforeAll(async () => {
    admin = await createUser({ companyId: a.id, email: `admin@${tag}.co`, role: "ADMIN" });
    adminSession = sessionFor(a, admin.id, "ADMIN");
    otherAdmin = await createUser({ companyId: a.id, email: `admin2@${tag}.co`, role: "ADMIN" });
    staff = await createUser({ companyId: a.id, email: `personal@${tag}.co` });
  });

  it("ve el equipo y solo puede invitar Personal", async () => {
    const team = await getTeam(adminSession);
    expect(team.invitableRoles).toEqual(["STAFF"]);
    const flags = Object.fromEntries(team.members.map((m) => [m.id, m.canManage]));
    expect(flags[owner.id]).toBe(false);
    expect(flags[admin.id]).toBe(false);
    expect(flags[otherAdmin.id]).toBe(false);
    expect(flags[staff.id]).toBe(true);

    expect(
      await inviteStaffMember(
        adminSession,
        { name: "Nuevo Admin", email: `nuevo-admin@${tag}.co`, role: "ADMIN" },
        context,
      ),
    ).toEqual({ ok: false, fieldErrors: { role: expect.any(String) } });
    expect(
      await db.staffInvitation.count({ where: { email: `nuevo-admin@${tag}.co` } }),
    ).toBe(0);

    expect(
      await inviteStaffMember(
        adminSession,
        { name: "Nuevo Personal", email: `nuevo-personal@${tag}.co`, role: "STAFF" },
        context,
      ),
    ).toEqual({ ok: true });
  });

  it("no reenvía ni revoca invitaciones de administradores", async () => {
    const email = `invitado-admin@${tag}.co`;
    await inviteStaffMember(ownerSession, { name: "Invitado Admin", email, role: "ADMIN" }, context);
    const { id } = await db.staffInvitation.findFirstOrThrow({
      where: { email, revokedAt: null },
    });

    expect(await resendStaffInvitation(adminSession, id, context)).toMatchObject({ ok: false });
    expect(await revokeInvitation(adminSession, id, context)).toMatchObject({ ok: false });
    const invitation = await db.staffInvitation.findUniqueOrThrow({ where: { id } });
    expect(invitation.revokedAt).toBeNull();

    const team = await getTeam(adminSession);
    expect(team.invitations.find((i) => i.id === id)?.canManage).toBe(false);
  });

  it("desactiva al Personal pero no a otro administrador", async () => {
    expect(await setStaffMemberActive(adminSession, otherAdmin.id, false, context)).toMatchObject({
      ok: false,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: otherAdmin.id } })).toMatchObject({
      isActive: true,
    });

    expect(await setStaffMemberActive(adminSession, staff.id, false, context)).toEqual({
      ok: true,
    });
    expect(await setStaffMemberActive(adminSession, staff.id, true, context)).toEqual({
      ok: true,
    });
  });

  it("el propietario sí gestiona administradores", async () => {
    expect(await setStaffMemberActive(ownerSession, otherAdmin.id, false, context)).toEqual({
      ok: true,
    });
    expect(await setStaffMemberActive(ownerSession, otherAdmin.id, true, context)).toEqual({
      ok: true,
    });
  });
});
