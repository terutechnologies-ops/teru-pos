import "server-only";

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
