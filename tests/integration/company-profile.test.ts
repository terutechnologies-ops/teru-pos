import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  getCompanyProfile,
  saveCompanyProfile,
} from "@/server/services/companies";

import { cleanupCompanies, createCompany, uniqueTag } from "../helpers";

const tag = uniqueTag("profile");
let a: { id: string; name: string; slug: string };
let b: { id: string; name: string; slug: string };

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => cleanupCompanies(tag));

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(
  company: { id: string; name: string; slug: string },
  role: StaffRole,
): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null },
  };
}

const input = {
  name: "Su Arepa Gourmet",
  taxId: "900.123.456-7",
  phone: "",
  email: "Admin@SuArepa.co",
  address: "Calle 1 # 2-3",
  currency: "USD",
  dateFormat: "YYYY-MM-DD",
};

describe("saveCompanyProfile", () => {
  it("guarda los datos normalizados solo en la empresa de la sesión", async () => {
    expect(await saveCompanyProfile(sessionFor(a, "OWNER"), input)).toEqual({
      ok: true,
    });

    expect(await getCompanyProfile(sessionFor(a, "OWNER"))).toMatchObject({
      name: "Su Arepa Gourmet",
      taxId: "900.123.456-7",
      phone: null,
      email: "admin@suarepa.co",
      currency: "USD",
      dateFormat: "YYYY-MM-DD",
      setupCompletedAt: null,
    });
    const other = await db.company.findUniqueOrThrow({ where: { id: b.id } });
    expect(other).toMatchObject({ name: b.name, currency: "COP", taxId: null });
  });

  it("devuelve el primer error de cada campo sin guardar", async () => {
    const result = await saveCompanyProfile(sessionFor(b, "OWNER"), {
      ...input,
      name: "",
      currency: "XYZ",
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: expect.any(String),
        currency: "Elige una moneda válida.",
      },
    });
    const other = await db.company.findUniqueOrThrow({ where: { id: b.id } });
    expect(other.name).toBe(b.name);
  });

  it("rechaza a quien no tiene company.setup", async () => {
    for (const role of ["ADMIN", "STAFF"] as const) {
      await expect(saveCompanyProfile(sessionFor(b, role), input)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(getCompanyProfile(sessionFor(b, role))).rejects.toThrow(
        ForbiddenError,
      );
    }
  });
});
