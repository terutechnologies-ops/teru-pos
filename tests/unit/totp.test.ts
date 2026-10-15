import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "@/server/services/auth/recovery-codes";
import { decryptSecret, encryptSecret } from "@/server/services/auth/secret-box";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpStep,
  verifyTotp,
} from "@/server/services/auth/totp";

// Secreto de los vectores de prueba de los RFC 4226 y 6238.
const RFC_SECRET = new TextEncoder().encode("12345678901234567890");
const RFC_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("códigos de un solo uso (TOTP)", () => {
  it("base32 de ida y vuelta", () => {
    expect(base32Encode(RFC_SECRET)).toBe(RFC_BASE32);
    expect(base32Decode(RFC_BASE32.toLowerCase().replace(/(.{4})/g, "$1 "))).toEqual(RFC_SECRET);
    expect(base32Decode("ABC1")).toBeNull();
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("cumple los vectores del RFC 4226 (HOTP) y del RFC 6238 (TOTP con SHA-1)", () => {
    expect(Array.from({ length: 10 }, (_, counter) => hotp(RFC_SECRET, counter))).toEqual([
      "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489",
    ]);
    const at = (seconds: number) => hotp(RFC_SECRET, totpStep(new Date(seconds * 1000)), 8);
    expect([59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000].map(at)).toEqual([
      "94287082", "07081804", "14050471", "89005924", "69279037", "65353130",
    ]);
  });

  it("acepta el paso anterior y el siguiente, nunca un código ya usado", () => {
    const now = new Date(1_800_000_000_000);
    const step = totpStep(now);
    const code = (s: number) => hotp(RFC_SECRET, s);
    const verify = (c: string, lastStep: number | null = null) => verifyTotp(RFC_BASE32, c, { now, lastStep });

    expect(verify(code(step))).toBe(step);
    expect(verify(code(step - 1))).toBe(step - 1);
    expect(verify(code(step + 1))).toBe(step + 1);
    expect(verify(code(step + 2))).toBeNull();
    expect(verify(code(step - 2))).toBeNull();
    // Ya usado el actual: ni él ni el anterior sirven; el siguiente sí.
    expect(verify(code(step), step)).toBeNull();
    expect(verify(code(step - 1), step)).toBeNull();
    expect(verify(code(step + 1), step)).toBe(step + 1);
    expect(verify("12345")).toBeNull();
    expect(verify("abcdef")).toBeNull();
  });

  it("arma el enlace otpauth que leen las apps", () => {
    expect(otpauthUri({ secret: RFC_BASE32, account: "ana@teru.co", issuer: "Teru POS" })).toBe(
      `otpauth://totp/Teru%20POS%3Aana%40teru.co?secret=${RFC_BASE32}&issuer=Teru+POS&algorithm=SHA1&digits=6&period=30`,
    );
  });
});

describe("secretos cifrados", () => {
  it("cifra con AES-256-GCM y detecta alteraciones o una llave distinta", () => {
    const key = randomBytes(32);
    const box = encryptSecret(RFC_BASE32, key);
    expect(box).toMatch(/^v1:/);
    expect(box).not.toContain(RFC_BASE32);
    expect(encryptSecret(RFC_BASE32, key)).not.toBe(box); // IV aleatorio
    expect(decryptSecret(box, key)).toBe(RFC_BASE32);

    expect(() => decryptSecret(box, randomBytes(32))).toThrow();
    const raw = Buffer.from(box.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptSecret(`v1:${raw.toString("base64")}`, key)).toThrow();
    expect(() => decryptSecret("otro", key)).toThrow("formato");
  });
});

describe("códigos de respaldo", () => {
  it("son distintos, legibles y se comparan normalizados", () => {
    const codes = generateRecoveryCodes(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    expect(normalizeRecoveryCode(" abcde-23456 ")).toBe("ABCDE23456");
    expect(hashRecoveryCode("abcde 23456")).toBe(hashRecoveryCode("ABCDE-23456"));
    expect(hashRecoveryCode("ABCDE-23456")).toMatch(/^[0-9a-f]{64}$/);
  });
});
