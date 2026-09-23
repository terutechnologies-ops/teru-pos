import { describe, expect, it } from "vitest";

import {
  hashPassword,
  verifyPassword,
} from "@/server/services/auth/passwords";
import { generateToken, hashToken } from "@/server/services/auth/tokens";

describe("tokens", () => {
  it("genera tokens únicos de 32 bytes en base64url", () => {
    const a = generateToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("el hash es SHA-256 hex y determinista", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("contraseñas", () => {
  it("usa argon2id y verifica correctamente", async () => {
    const hash = await hashPassword("Clave-Segura-1");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "Clave-Segura-1")).toBe(true);
    expect(await verifyPassword(hash, "otra")).toBe(false);
  });

  it("un hash corrupto se trata como no coincidente", async () => {
    expect(await verifyPassword("no-es-un-hash", "x")).toBe(false);
  });
});
