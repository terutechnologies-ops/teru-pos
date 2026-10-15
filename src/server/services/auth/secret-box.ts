import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado de secretos guardados en la base (la clave TOTP del equipo Teru)
// con AES-256-GCM: con una copia de la base y sin la llave, no sirven.
// Formato: "v1:" + base64(iv de 12 bytes | etiqueta de 16 | texto cifrado).

const VERSION = "v1:";

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

// Lanza si el texto fue alterado o la llave no es la misma.
export function decryptSecret(box: string, key: Buffer): string {
  if (!box.startsWith(VERSION)) throw new Error("Secreto cifrado con un formato desconocido");
  const raw = Buffer.from(box.slice(VERSION.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
