import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { COMPANY_EVENTS } from "@/server/services/auth/config";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  completeCompanySetup,
  getSetupSummary,
} from "@/server/services/companies";

import { cleanupCompanies, createCompany, createUser, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("setup-done");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let ownerId: string;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await db.branch.create({
    data: { companyId: a.id, name: "Sede principal", isMain: true },
  });
  const owner = await createUser({
    companyId: a.id,
    email: `owner@${tag}.co`,
    role: "OWNER",
    name: "Dueña",
  });
  ownerId = owner.id;
  await createUser({ companyId: a.id, email: `activo@${tag}.co`, name: "Activo" });
  await createUser({
    companyId: a.id,
    email: `inactivo@${tag}.co`,
    name: "Inactivo",
    isActive: false,
  });
  await createUser({ companyId: b.id, email: `otro@${tag}.co`, name: "Otra empresa" });

  const invitation = (email: string, hours: number, extra = {}) => ({
    companyId: a.id,
    email,
    name: email.split("@")[0],
    role: "STAFF" as const,
    tokenHash: `${tag}-${email}`,
    expiresAt: new Date(Date.now() + hours * 3_600_000),
    ...extra,
  });
  await db.staffInvitation.createMany({
    data: [
      invitation(`vigente@${tag}.co`, 24),
      invitation(`vencida@${tag}.co`, -1),
      invitation(`revocada@${tag}.co`, 24, { revokedAt: new Date() }),
    ],
  });
});
afterAll(() => cleanupCompanies(tag));

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: Company, role: StaffRole, userId = ownerId): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null },
  };
}

describe("getSetupSummary", () => {
  it("resume empresa, sede, miembros activos e invitaciones pendientes", async () => {
    const summary = await getSetupSummary(sessionFor(a, "OWNER"));

    expect(summary?.profile).toMatchObject({ name: a.name, currency: "COP" });
    expect(summary?.mainBranch?.name).toBe("Sede principal");
    expect(summary?.members.map((m) => m.name).sort()).toEqual(["Activo", "Dueña"]);
    expect(
      summary?.invitations.map((i) => [i.name, i.expired]).sort(),
    ).toEqual([
      ["vencida", true],
      ["vigente", false],
    ]);
  });

  it("solo con company.manage", async () => {
    for (const role of ["ADMIN", "STAFF"] as const) {
      await expect(getSetupSummary(sessionFor(a, role))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });
});

describe("completeCompanySetup", () => {
  const events = () =>
    db.authAuditLog.findMany({
      where: { companyId: a.id, action: COMPANY_EVENTS.SETUP_COMPLETED },
    });

  it("rechaza a quien no tiene company.manage sin cambiar nada", async () => {
    await expect(
      completeCompanySetup(sessionFor(a, "ADMIN"), ctx(tag)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const company = await db.company.findUnique({ where: { id: a.id } });
    expect(company?.setupCompletedAt).toBeNull();
  });

  it("marca la empresa una sola vez y registra un solo evento", async () => {
    // Las invitaciones pendientes no impiden finalizar.
    expect(await completeCompanySetup(sessionFor(a, "OWNER"), ctx(tag))).toEqual({
      marked: true,
    });
    const first = await db.company.findUnique({ where: { id: a.id } });
    expect(first?.setupCompletedAt).toBeInstanceOf(Date);

    expect(await completeCompanySetup(sessionFor(a, "OWNER"), ctx(tag))).toEqual({
      marked: false,
    });
    const second = await db.company.findUnique({ where: { id: a.id } });
    expect(second?.setupCompletedAt).toEqual(first?.setupCompletedAt);

    const logged = await events();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ actorType: "STAFF", actorId: ownerId });

    const other = await db.company.findUnique({ where: { id: b.id } });
    expect(other?.setupCompletedAt).toBeNull();
  });
});
