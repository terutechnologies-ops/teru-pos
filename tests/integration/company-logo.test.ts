import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { LOGO_MAX_BYTES } from "@/lib/company-logo";
import type { StaffSessionDto } from "@/server/dto/auth";
import { COMPANY_EVENTS } from "@/server/services/auth/config";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  companyLogoUrl,
  removeCompanyLogo,
  updateCompanyLogo,
} from "@/server/services/companies";
import { setFileStorageForTesting } from "@/server/services/storage";
import { createMemoryStorage } from "@/server/services/storage/memory";

import { cleanupCompanies, createCompany, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("logo");
type Company = { id: string; name: string; slug: string };
let a: Company;
let memory: ReturnType<typeof createMemoryStorage>;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const blob = (bytes: Uint8Array<ArrayBuffer>, type = "image/png") =>
  new Blob([bytes], { type });

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
});
beforeEach(() => {
  memory = createMemoryStorage();
  setFileStorageForTesting(memory.storage);
});
afterAll(async () => {
  setFileStorageForTesting(null);
  await cleanupCompanies(tag);
});

function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const logoPath = async () =>
  (await db.company.findUniqueOrThrow({ where: { id: a.id } })).logoPath;
const events = (action: string) =>
  db.authAuditLog.count({ where: { companyId: a.id, action } });

describe("logo de la empresa", () => {
  it("sube, reemplaza (borrando el anterior) y quita el logo", async () => {
    const owner = sessionFor(a, "OWNER");

    expect(await updateCompanyLogo(owner, blob(PNG), ctx(tag))).toEqual({ ok: true });
    const first = await logoPath();
    expect(first).toMatch(new RegExp(`^companies/${a.id}/logo-[\\w-]+\\.png$`));
    expect(memory.files.get(first!)?.contentType).toBe("image/png");
    expect(companyLogoUrl(first)).toBe(`memory://${first}`);

    // El tipo sale del contenido, no del que declara el navegador.
    expect(await updateCompanyLogo(owner, blob(JPEG, "image/png"), ctx(tag))).toEqual({
      ok: true,
    });
    const second = await logoPath();
    expect(second).toMatch(/\.jpg$/);
    expect(second).not.toBe(first);
    expect(memory.files.has(first!)).toBe(false);
    expect(memory.files.get(second!)?.contentType).toBe("image/jpeg");
    expect(await events(COMPANY_EVENTS.LOGO_UPDATED)).toBe(2);

    expect(await removeCompanyLogo(owner, ctx(tag))).toEqual({ ok: true });
    expect(await logoPath()).toBeNull();
    expect(memory.files.size).toBe(0);
    expect(await events(COMPANY_EVENTS.LOGO_REMOVED)).toBe(1);

    // Quitar sin logo no cambia nada ni registra otro evento.
    expect(await removeCompanyLogo(owner, ctx(tag))).toEqual({ ok: true });
    expect(await events(COMPANY_EVENTS.LOGO_REMOVED)).toBe(1);
  });

  it("rechaza archivos vacíos, grandes o que no son imágenes permitidas", async () => {
    const owner = sessionFor(a, "OWNER");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);

    for (const file of [null, blob(new Uint8Array()), blob(svg, "image/svg+xml"), blob(big)]) {
      expect(await updateCompanyLogo(owner, file, ctx(tag))).toMatchObject({ ok: false });
    }
    expect(memory.files.size).toBe(0);
    expect(await logoPath()).toBeNull();
  });

  it("sin almacenamiento configurado responde con error", async () => {
    setFileStorageForTesting(null);
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    try {
      expect(await updateCompanyLogo(sessionFor(a, "OWNER"), blob(PNG), ctx(tag))).toEqual({
        ok: false,
        error: expect.any(String),
      });
      expect(companyLogoUrl("companies/x/logo.png")).toBeNull();
    } finally {
      if (saved.url) process.env.SUPABASE_URL = saved.url;
      if (saved.key) process.env.SUPABASE_SECRET_KEY = saved.key;
    }
  });

  it("solo con company.manage", async () => {
    for (const role of ["ADMIN", "STAFF"] as const) {
      await expect(
        updateCompanyLogo(sessionFor(a, role), blob(PNG), ctx(tag)),
      ).rejects.toThrow(ForbiddenError);
      await expect(removeCompanyLogo(sessionFor(a, role), ctx(tag))).rejects.toThrow(
        ForbiddenError,
      );
    }
  });
});
