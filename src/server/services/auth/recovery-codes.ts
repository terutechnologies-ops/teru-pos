import "server-only";

import { randomInt } from "node:crypto";

import { hashToken } from "@/server/services/auth/tokens";

// Códigos de respaldo de la verificación en dos pasos: "ABCDE-23456", sin
// letras ni números que se confundan (0/O, 1/I/L). 10 caracteres de 31
// posibles (~49 bits) y de un solo uso: basta un SHA-256 sin sal.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(count: number): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

// Se escribe como sea (minúsculas, sin guion, con espacios): se compara
// normalizado.
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function hashRecoveryCode(code: string): string {
  return hashToken(normalizeRecoveryCode(code));
}
