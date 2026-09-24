import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import * as companies from "@/server/data/companies";
import { findMainBranch } from "@/server/data/branches";
import * as invitations from "@/server/data/staff-invitations";
import { createCompany as createCompanyService } from "@/server/services/companies";
import { hashToken } from "@/server/services/auth/tokens";

import {
  cleanupCompanies,
  createCompany,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("setup");
const inOneHour = () => new Date(Date.now() + 3600e3);
let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => cleanupCompanies(tag));

function invite(
  email: string,
  name: string,
  companyId = a.id,
  expiresAt = inOneHour(),
) {
  const tokenHash = `${tag}-${name}`;
  return invitations
    .replaceStaffInvitation({
      companyId,
      email,
      name,
      role: "STAFF",
      tokenHash,
      expiresAt,
      invitedById: null,
    })
    .then(() => tokenHash);
}

const accept = (tokenHash: string, companyId = a.id) =>
  invitations.acceptStaffInvitation({
    tokenHash,
    companyId,
    passwordHash: "hash-de-prueba",
  });

describe("configuración de la empresa", () => {
  it("guarda los datos y marca el asistente completado una sola vez", async () => {
    await companies.updateCompanySettings(a.id, {
      name: "Empresa A",
      taxId: "900.123.456-7",
      phone: null,
      email: `admin@${tag}.co`,
      address: null,
      currency: "USD",
      dateFormat: "DD/MM/YYYY",
    });
    const settings = await companies.findCompanySettings(a.id);
    expect(settings).toMatchObject({
      name: "Empresa A",
      taxId: "900.123.456-7",
      currency: "USD",
      setupCompletedAt: null,
    });

    const first = new Date("2026-01-01T00:00:00Z");
    expect(await companies.markCompanySetupCompleted(a.id, first)).toBe(true);
    expect(await companies.markCompanySetupCompleted(a.id)).toBe(false);
    expect((await companies.findCompanySettings(a.id))?.setupCompletedAt).toEqual(
      first,
    );
  });
});

describe("sucursales", () => {
  it("permite una sola sucursal principal por empresa", async () => {
    await db.branch.create({
      data: { companyId: b.id, name: "Centro", isMain: true },
    });
    await expect(
      db.branch.create({ data: { companyId: b.id, name: "Norte", isMain: true } }),
    ).rejects.toThrow();
    await db.branch.create({ data: { companyId: b.id, name: "Norte" } });

    expect((await findMainBranch(b.id))?.name).toBe("Centro");
    expect(await findMainBranch(a.id)).toBeNull();
  });
});

describe("invitaciones del personal", () => {
  it("una invitación nueva revoca la pendiente del mismo correo", async () => {
    const email = `repite@${tag}.co`;
    const old = await invite(email, "repite-1");
    const current = await invite(email, "repite-2");

    expect(await invitations.findValidStaffInvitation(old, a.id)).toBeNull();
    expect(await invitations.findValidStaffInvitation(current, a.id)).toMatchObject({
      email,
      role: "STAFF",
    });
    const pending = await invitations.listPendingStaffInvitations(a.id);
    expect(pending.filter((i) => i.email === email)).toHaveLength(1);
  });

  it("no se acepta vencida, revocada ni desde otra empresa", async () => {
    const expired = await invite(
      `vencida@${tag}.co`,
      "vencida",
      a.id,
      new Date(Date.now() - 1000),
    );
    expect(await accept(expired)).toEqual({ status: "INVALID" });

    const revoked = await invite(`revocada@${tag}.co`, "revocada");
    const row = await db.staffInvitation.findUniqueOrThrow({
      where: { tokenHash: revoked },
    });
    expect(await invitations.revokeStaffInvitation(row.id, b.id)).toBe(false);
    expect(await invitations.revokeStaffInvitation(row.id, a.id)).toBe(true);
    expect(await accept(revoked)).toEqual({ status: "INVALID" });

    const other = await invite(`otra@${tag}.co`, "otra");
    expect(await invitations.findValidStaffInvitation(other, b.id)).toBeNull();
    expect(await accept(other, b.id)).toEqual({ status: "INVALID" });
  });

  it("al aceptar crea el usuario con el rol invitado, una sola vez", async () => {
    const token = await invite(`nuevo@${tag}.co`, "nuevo");
    const result = await accept(token);
    expect(result.status).toBe("ACCEPTED");

    const userId = result.status === "ACCEPTED" ? result.userId : "";
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      companyId: a.id,
      email: `nuevo@${tag}.co`,
      role: "STAFF",
      isActive: true,
    });
    const row = await db.staffInvitation.findUniqueOrThrow({
      where: { tokenHash: token },
    });
    expect(row.userId).toBe(userId);
    expect(row.acceptedAt).not.toBeNull();

    expect(await accept(token)).toEqual({ status: "INVALID" });
  });

  it("dos aceptaciones simultáneas crean un solo usuario", async () => {
    const token = await invite(`carrera@${tag}.co`, "carrera");
    const results = await Promise.all([accept(token), accept(token)]);

    expect(results.map((r) => r.status).sort()).toEqual(["ACCEPTED", "INVALID"]);
    expect(
      await db.user.count({ where: { companyId: a.id, email: `carrera@${tag}.co` } }),
    ).toBe(1);
  });

  it("si el correo ya tiene cuenta no consume la invitación", async () => {
    const email = `existe@${tag}.co`;
    await createUser({ companyId: a.id, email });
    const token = await invite(email, "existe");

    expect(await accept(token)).toEqual({ status: "EMAIL_TAKEN" });
    expect(await invitations.findValidStaffInvitation(token, a.id)).not.toBeNull();
  });
});

describe("alta de empresa (servicio del script)", () => {
  it("crea empresa, sucursal principal e invitación OWNER con enlace", async () => {
    const slug = `${tag}-nueva`;
    const result = await createCompanyService({
      name: "Negocio Nuevo",
      slug,
      ownerName: "Ana Pérez",
      ownerEmail: `ANA@${tag}.co`,
    });

    expect(await findMainBranch(result.companyId)).toMatchObject({
      name: companies.MAIN_BRANCH_NAME,
    });
    const token = new URL(result.invitationUrl).searchParams.get("token") ?? "";
    expect(result.invitationUrl).toContain(`/${slug}/invitacion?token=`);

    const invitation = await invitations.findValidStaffInvitation(
      hashToken(token),
      result.companyId,
    );
    expect(invitation).toMatchObject({ email: `ana@${tag}.co`, role: "OWNER" });

    await expect(
      createCompanyService({
        name: "Duplicada",
        slug,
        ownerName: "Otro",
        ownerEmail: `otro@${tag}.co`,
      }),
    ).rejects.toThrow();
    await expect(
      createCompanyService({
        name: "Reservada",
        slug: "api",
        ownerName: "Otro",
        ownerEmail: `otro@${tag}.co`,
      }),
    ).rejects.toThrow();
  });
});
