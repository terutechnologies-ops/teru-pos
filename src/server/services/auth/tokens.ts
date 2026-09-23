import "server-only";

import { createHash, randomBytes } from "node:crypto";

// 32 bytes aleatorios: imposible de adivinar, por eso basta un SHA-256 sin
// sal para guardarlo (a diferencia de las contraseñas).
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
