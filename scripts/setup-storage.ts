// Crea el bucket público de archivos de las empresas (logos y fotos de
// productos) en Supabase Storage.
// Idempotente: si ya existe, no hace nada. Correr una vez por entorno.
//
// Uso: npm run storage:setup
import "dotenv/config";

import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "@/lib/images";
import { getStorageConfig } from "@/server/env";

async function main() {
  const config = getStorageConfig();
  if (!config) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno");
  }
  const response = await fetch(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: config.secretKey, "content-type": "application/json" },
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: true,
      // Límites también en el proveedor, además de la validación propia.
      file_size_limit: IMAGE_MAX_BYTES,
      allowed_mime_types: Object.keys(IMAGE_TYPES),
    }),
  });
  const body = await response.text();
  if (response.ok) return console.log(`Bucket "${config.bucket}" creado.`);
  if (/already exists|Duplicate/i.test(body)) {
    return console.log(`Bucket "${config.bucket}" ya existía.`);
  }
  throw new Error(`No se pudo crear el bucket (${response.status}): ${body}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
