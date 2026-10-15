import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Códigos de un solo uso por tiempo (TOTP, RFC 6238), los de las apps
// autenticadoras: HMAC-SHA1, 6 dígitos, cambian cada 30 s. Sin librerías:
// solo la criptografía de Node.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

// Acepta minúsculas, espacios y el relleno "=". null si trae otro carácter.
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

// 160 bits, el tamaño que recomienda el RFC 4226 para HMAC-SHA1.
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

// HOTP (RFC 4226): HMAC del contador y truncado dinámico.
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, "0");
}

// Paso del código si es válido: en la ventana de ±`window` pasos (reloj del
// teléfono desfasado) y posterior al último aceptado (un código usado no
// sirve otra vez). null si no.
export function verifyTotp(
  secretBase32: string,
  code: string,
  { now, lastStep, window = 1 }: { now: Date; lastStep: number | null; window?: number },
): number | null {
  const secret = base32Decode(secretBase32);
  if (!secret || !/^\d{6}$/.test(code)) return null;
  const given = Buffer.from(code);
  const current = totpStep(now);
  for (let step = current - window; step <= current + window; step += 1) {
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), given)) return step;
  }
  return null;
}

// Enlace que leen las apps (el QR lo contiene).
export function otpauthUri({ secret, account, issuer }: { secret: string; account: string; issuer: string }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}
