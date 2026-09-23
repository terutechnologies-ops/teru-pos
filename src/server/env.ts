import "server-only";

import { z } from "zod";

// URL pública de la app para armar enlaces (recuperación de contraseña).
// Se toma de configuración y no de la cabecera Host, que el cliente controla.
export function getAppUrl(): string {
  const parsed = z.url().safeParse(process.env.APP_URL);
  if (!parsed.success) throw new Error("APP_URL no está configurada");
  return parsed.data.replace(/\/+$/, "");
}
