import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import * as sessions from "@/server/data/user-sessions";

import {
  cleanupCompanies,
  createCompany,
  createUser,
  uniqueTag,
} from "../helpers";

const tag = uniqueTag("sessions");
const inOneHour = () => new Date(Date.now() + 3600e3);
let companyA: { id: string };
let companyB: { id: string };
let userId: string;

beforeAll(async () => {
  companyA = await createCompany(`${tag}-a`);
  companyB = await createCompany(`${tag}-b`);
  userId = (await createUser({ companyId: companyA.id, email: `u@${tag}.co` }))
    .id;
});
afterAll(() => cleanupCompanies(tag));

async function newSession(name: string, expiresAt = inOneHour()) {
  const tokenHash = `${tag}-${name}`;
  await sessions.createUserSession({
    userId,
    companyId: companyA.id,
    tokenHash,
    persistent: false,
    expiresAt,
  });
  return tokenHash;
}

describe("capa de datos de sesiones", () => {
  it("devuelve la sesión activa sin campos sensibles", async () => {
    const hash = await newSession("activa");
    const found = await sessions.findActiveUserSession(hash, companyA.id);
    expect(found?.user.id).toBe(userId);
    expect(found?.user).not.toHaveProperty("passwordHash");
    expect(found).not.toHaveProperty("tokenHash");
  });

  it("aísla por empresa: no se encuentra ni se revoca desde otra", async () => {
    const hash = await newSession("aislada");
    expect(await sessions.findActiveUserSession(hash, companyB.id)).toBeNull();
    expect(await sessions.revokeUserSession(hash, companyB.id)).toBe(false);
    expect(
      await sessions.findActiveUserSession(hash, companyA.id),
    ).not.toBeNull();
  });

  it("ignora sesiones vencidas y revocadas", async () => {
    const expired = await newSession("vencida", new Date(Date.now() - 1000));
    expect(
      await sessions.findActiveUserSession(expired, companyA.id),
    ).toBeNull();

    const revoked = await newSession("revocada");
    expect(await sessions.revokeUserSession(revoked, companyA.id)).toBe(true);
    expect(
      await sessions.findActiveUserSession(revoked, companyA.id),
    ).toBeNull();
  });

  it("extiende el vencimiento", async () => {
    const hash = await newSession("extender");
    const found = await sessions.findActiveUserSession(hash, companyA.id);
    const later = new Date(Date.now() + 7200e3);
    await sessions.extendUserSession(found!.id, companyA.id, later);
    const again = await sessions.findActiveUserSession(hash, companyA.id);
    expect(again!.expiresAt.getTime()).toBe(later.getTime());
  });

  it("rechaza sesiones de usuarios inactivos y revoca todas", async () => {
    const hash = await newSession("inactivo");
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    expect(await sessions.findActiveUserSession(hash, companyA.id)).toBeNull();
    expect(
      await sessions.revokeAllUserSessions(userId, companyA.id),
    ).toBeGreaterThan(0);
    await db.user.update({ where: { id: userId }, data: { isActive: true } });
    expect(await sessions.findActiveUserSession(hash, companyA.id)).toBeNull();
  });
});
