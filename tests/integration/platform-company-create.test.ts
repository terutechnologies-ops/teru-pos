import { afterAll, afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { hashToken } from "@/server/services/auth/tokens";
import { setMessageSenderForTesting, type OutgoingEmail } from "@/server/services/messaging";
import type { PlatformSessionDto } from "@/server/services/platform/auth";
import {
  createCompanyFromPanel,
  getPlatformCompany,
  resendOwnerWelcome,
} from "@/server/services/platform/companies";

import { cleanupCompanies, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("teru-alta");
afterAll(() => cleanupCompanies(tag));
afterEach(() => setMessageSenderForTesting(null));

const teru: PlatformSessionDto = {
  sessionId: "s",
  expiresAt: new Date(),
  user: { id: "teru-user", name: "Equipo Teru", email: "equipo@teru.co" },
};

function captureEmails() {
  const sent: OutgoingEmail[] = [];
  setMessageSenderForTesting({ sendEmail: async (email) => void sent.push(email) });
  return sent;
}

const input = (slug: string) => ({
  name: "Panadería Sol",
  slug: `${tag}-${slug}`,
  ownerName: "Sara Sol",
  ownerEmail: `sara-${slug}@${tag}.co`,
});

const tokenOf = (email: OutgoingEmail) => email.text.match(/token=([\w-]+)/)?.[1] ?? "";

describe("alta de empresas desde el panel Teru", () => {
  it("valida los campos con mensajes por campo y rechaza direcciones reservadas o usadas", async () => {
    expect(
      await createCompanyFromPanel(teru, { name: "", slug: "Mi Empresa", ownerName: "S", ownerEmail: "malo" }, ctx(tag)),
    ).toEqual({
      ok: false,
      fieldErrors: {
        name: expect.stringContaining("nombre de la empresa"),
        slug: expect.stringContaining("minúsculas"),
        ownerName: expect.stringContaining("propietario"),
        ownerEmail: "Escribe un correo válido.",
      },
    });
    expect(await createCompanyFromPanel(teru, { ...input("x"), slug: "teru" }, ctx(tag))).toMatchObject({
      ok: false,
      fieldErrors: { slug: expect.stringContaining("teru") },
    });

    captureEmails();
    expect((await createCompanyFromPanel(teru, input("usada"), ctx(tag))).ok).toBe(true);
    expect(await createCompanyFromPanel(teru, input("usada"), ctx(tag))).toEqual({
      ok: false,
      fieldErrors: { slug: "Ya existe una empresa con esa dirección." },
    });
  });

  it("crea la empresa con lo de siempre, envía la bienvenida y audita a nombre del equipo Teru", async () => {
    const sent = captureEmails();
    const result = await createCompanyFromPanel(teru, input("ok"), ctx(tag, "alta"));
    if (!result.ok) throw new Error(JSON.stringify(result.fieldErrors));
    expect(result.emailSent).toBe(true);

    const companyId = result.companyId;
    expect(await db.branch.count({ where: { companyId, isMain: true } })).toBe(1);
    expect(await db.warehouse.count({ where: { companyId, isMain: true } })).toBe(1);
    expect(await db.paymentMethod.count({ where: { companyId } })).toBe(3);
    expect(await db.expenseCategory.count({ where: { companyId } })).toBeGreaterThan(0);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(`sara-ok@${tag}.co`);
    const invitation = await db.staffInvitation.findFirstOrThrow({ where: { companyId } });
    expect(invitation).toMatchObject({ role: "OWNER", acceptedAt: null, revokedAt: null });
    expect(invitation.tokenHash).toBe(hashToken(tokenOf(sent[0])));

    const events = await db.authAuditLog.findMany({ where: { companyId }, orderBy: { action: "asc" } });
    expect(events.map((e) => [e.action, e.actorType, e.actorId, e.ipAddress])).toEqual([
      ["COMPANY_CREATED", "PLATFORM", "teru-user", `${tag}-ip-alta`],
      ["STAFF_INVITATION_CREATED", "PLATFORM", "teru-user", `${tag}-ip-alta`],
    ]);

    const detail = await getPlatformCompany(teru, companyId);
    expect(detail).toMatchObject({
      status: "SETUP_PENDING",
      owner: null,
      ownerInvitation: { name: "Sara Sol", email: `sara-ok@${tag}.co`, expired: false },
    });
  });

  it("si la bienvenida falla, la empresa queda creada y lo avisa", async () => {
    setMessageSenderForTesting({
      sendEmail: async () => {
        throw new Error("Resend rechazó el correo (429)");
      },
    });
    const result = await createCompanyFromPanel(teru, input("sin-correo"), ctx(tag));
    expect(result).toMatchObject({ ok: true, emailSent: false });
  });

  it("reenviar la bienvenida da un enlace nuevo, invalida el anterior y se audita", async () => {
    const sent = captureEmails();
    const created = await createCompanyFromPanel(teru, input("reenvio"), ctx(tag));
    if (!created.ok) throw new Error("no se creó");
    const companyId = created.companyId;
    const first = tokenOf(sent[0]);
    // Vencida: igual se puede reenviar.
    await db.staffInvitation.updateMany({ where: { companyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await getPlatformCompany(teru, companyId))?.ownerInvitation?.expired).toBe(true);

    expect(await resendOwnerWelcome(teru, companyId, ctx(tag, "reenvio"))).toEqual({ ok: true });
    expect(sent).toHaveLength(2);
    const second = tokenOf(sent[1]);
    expect(second).not.toBe(first);

    const invitations = await db.staffInvitation.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    expect(invitations).toHaveLength(2);
    expect(invitations[0].revokedAt).not.toBeNull();
    expect(invitations[1]).toMatchObject({ role: "OWNER", revokedAt: null, tokenHash: hashToken(second) });
    expect(invitations[1].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      await db.authAuditLog.count({
        where: { companyId, action: "STAFF_INVITATION_RESENT", actorType: "PLATFORM", actorId: "teru-user" },
      }),
    ).toBe(1);
  });

  it("no reenvía si el propietario ya tiene cuenta, la empresa está desactivada o no existe", async () => {
    captureEmails();
    const withOwner = await createCompanyFromPanel(teru, input("con-dueno"), ctx(tag));
    const inactive = await createCompanyFromPanel(teru, input("apagada"), ctx(tag));
    if (!withOwner.ok || !inactive.ok) throw new Error("no se creó");
    await createUser({ companyId: withOwner.companyId, email: `sara-con-dueno@${tag}.co`, role: "OWNER" });
    await db.company.update({
      where: { id: inactive.companyId },
      data: { isActive: false, deactivatedAt: new Date(), deactivationReason: "Prueba" },
    });

    expect(await resendOwnerWelcome(teru, withOwner.companyId, ctx(tag))).toEqual({
      ok: false,
      error: "El propietario ya creó su cuenta.",
    });
    expect((await getPlatformCompany(teru, withOwner.companyId))?.ownerInvitation).toBeNull();
    expect(await resendOwnerWelcome(teru, inactive.companyId, ctx(tag))).toEqual({
      ok: false,
      error: "La empresa está desactivada.",
    });
    expect(await resendOwnerWelcome(teru, "no-existe", ctx(tag))).toEqual({ ok: false, error: "Esta empresa no existe." });
  });

  it("sin sesión del equipo Teru no crea ni reenvía", async () => {
    const none = {} as PlatformSessionDto;
    await expect(createCompanyFromPanel(none, input("nadie"), ctx(tag))).rejects.toThrow();
    await expect(resendOwnerWelcome(none, "x", ctx(tag))).rejects.toThrow();
    expect(await db.company.count({ where: { slug: `${tag}-nadie` } })).toBe(0);
  });
});
