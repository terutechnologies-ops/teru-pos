import "server-only";

import path from "node:path";

import { z } from "zod";

// URL pública de la app para armar enlaces (recuperación de contraseña).
// Se toma de configuración y no de la cabecera Host, que el cliente controla.
export function getAppUrl(): string {
  const parsed = z.url().safeParse(process.env.APP_URL);
  if (!parsed.success) throw new Error("APP_URL no está configurada");
  return parsed.data.replace(/\/+$/, "");
}

// Almacenamiento de archivos (Supabase Storage). Opcional: sin estas
// variables no se pueden subir logos, pero la app funciona. Un bucket
// público (logos y fotos de productos) y uno privado (recibos de gastos).
export const STORAGE_BUCKET = "company-assets";
export const PRIVATE_STORAGE_BUCKET = "company-private";

export function getStorageConfig() {
  const url = z.url().safeParse(process.env.SUPABASE_URL);
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url.success || !secretKey) return null;
  return {
    url: url.data.replace(/\/+$/, ""),
    secretKey,
    bucket: STORAGE_BUCKET,
    privateBucket: PRIVATE_STORAGE_BUCKET,
  };
}

// Solo en desarrollo: carpeta local para los archivos (LOCAL_STORAGE_DIR,
// relativa al proyecto). Si está, gana sobre Supabase: el desarrollo nunca
// sube archivos al almacenamiento de producción. Fuera de desarrollo se
// ignora.
export function getLocalStorageDir(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const dir = process.env.LOCAL_STORAGE_DIR?.trim();
  return dir ? path.resolve(dir) : null;
}

// Llave con que se cifra la clave de la verificación en dos pasos del
// equipo Teru: 32 bytes en base64 (openssl rand -base64 32). Distinta en
// cada entorno; si cambia, hay que reiniciar la verificación de las cuentas.
export function getTotpEncryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY?.trim() ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY no está configurada o no es válida (32 bytes en base64)");
  }
  return key;
}

// Correo (Resend). Sin RESEND_API_KEY no hay proveedor: en desarrollo los
// mensajes van al outbox y fuera de él el envío falla con un error claro.
// MAIL_FROM es el remitente de un dominio verificado en Resend, con nombre
// ("Teru POS <reportes@envios.midominio.com>") o solo la dirección.
const MAIL_FROM_PATTERN = /^(?:[^<>@\r\n]+ <[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/;

export function getMailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  const from = process.env.MAIL_FROM?.trim() ?? "";
  // Con la clave puesta, un remitente inválido es un error de configuración:
  // mejor fallar que enviar desde una dirección que Resend rechazará.
  if (!MAIL_FROM_PATTERN.test(from)) throw new Error("MAIL_FROM no está configurado o no es válido");
  return { apiKey, from };
}
