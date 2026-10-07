import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { findClosingReportEmails } from "@/server/data/companies";
import type { StaffSessionDto } from "@/server/dto/auth";
import { COMPANY_EVENTS } from "@/server/services/auth/config";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  getClosingReportRecipients,
  saveClosingReportRecipients,
} from "@/server/services/companies";

import { cleanupCompanies, createCompany, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("reportto");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => cleanupCompanies(tag));

function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

const owner = () => sessionFor(a, "OWNER");
const save = (value: string, session = owner()) =>
  saveClosingReportRecipients(session, value, ctx(tag));
const events = () =>
  db.authAuditLog.count({
    where: { companyId: a.id, action: COMPANY_EVENTS.REPORT_RECIPIENTS_UPDATED },
  });

describe("destinatarios del reporte de cierre", () => {
  it("empieza vacío (no se envía)", async () => {
    expect(await getClosingReportRecipients(owner())).toEqual([]);
  });

  it("guarda en minúsculas, con cualquier separador; audita solo los cambios", async () => {
    expect(await save(" Dueno@SuArepa.co,\nsocio@suarepa.co; ")).toEqual({
      ok: true,
      emails: ["dueno@suarepa.co", "socio@suarepa.co"],
    });
    expect(await getClosingReportRecipients(owner())).toEqual([
      "dueno@suarepa.co",
      "socio@suarepa.co",
    ]);
    expect(await events()).toBe(1);

    // Lo mismo escrito de otra forma no es un cambio.
    expect(await save("dueno@suarepa.co socio@suarepa.co")).toMatchObject({ ok: true });
    expect(await events()).toBe(1);

    expect(await save("")).toEqual({ ok: true, emails: [] });
    expect(await events()).toBe(2);
    // El evento no guarda los correos.
    const last = await db.authAuditLog.findFirstOrThrow({
      where: { companyId: a.id, action: COMPANY_EVENTS.REPORT_RECIPIENTS_UPDATED },
    });
    expect(JSON.stringify(last)).not.toContain("socio@");
  });

  it("rechaza correos inválidos, repetidos y más de 5 sin guardar nada", async () => {
    await save("dueno@suarepa.co");
    // Repetido sin distinguir mayúsculas, aunque sean más de 5 copias.
    expect(await save("dueno@suarepa.co, DUENO@suarepa.co")).toEqual({
      ok: false,
      error: "El correo dueno@suarepa.co está repetido.",
    });
    expect(await save(Array(7).fill("dueno@suarepa.co").join(", "))).toEqual({
      ok: false,
      error: "El correo dueno@suarepa.co está repetido.",
    });
    expect(await save("dueno@suarepa.co, no-es-correo")).toEqual({
      ok: false,
      error: '"no-es-correo" no es un correo válido.',
    });
    expect(await save("a@x.co, b@x.co, c@x.co, d@x.co, e@x.co, f@x.co")).toEqual({
      ok: false,
      error: "Escribe máximo 5 correos.",
    });
    expect(await save("a@x.co, b@x.co, c@x.co, d@x.co, e@x.co")).toMatchObject({ ok: true });
    expect(await findClosingReportEmails(a.id)).toHaveLength(5);
  });

  it("la base no admite más de 5", async () => {
    await expect(
      db.company.update({
        where: { id: a.id },
        data: { closingReportEmails: ["1@x.co", "2@x.co", "3@x.co", "4@x.co", "5@x.co", "6@x.co"] },
      }),
    ).rejects.toThrow();
  });

  it("solo el propietario, y cada empresa con lo suyo", async () => {
    await save("dueno@suarepa.co");
    expect(await getClosingReportRecipients(sessionFor(b, "OWNER"))).toEqual([]);
    await saveClosingReportRecipients(sessionFor(b, "OWNER"), "otro@b.co", ctx(tag));
    expect(await findClosingReportEmails(a.id)).toEqual(["dueno@suarepa.co"]);

    for (const role of ["ADMIN", "CASHIER", "STAFF"] as const) {
      await expect(getClosingReportRecipients(sessionFor(a, role))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(save("x@x.co", sessionFor(a, role))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await findClosingReportEmails(a.id)).toEqual(["dueno@suarepa.co"]);
  });
});
