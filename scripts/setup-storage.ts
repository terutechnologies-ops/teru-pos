// Crea los buckets de archivos de las empresas en Supabase Storage: el
// público (logos y fotos de productos) y el privado (recibos de gastos).
// Idempotente: si ya existen, no hace nada. Correr una vez por entorno.
//
// Uso: npm run storage:setup
import "dotenv/config";

import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "@/lib/images";
import { getStorageConfig } from "@/server/env";

async function createBucket(
  config: NonNullable<ReturnType<typeof getStorageConfig>>,
  bucket: string,
  isPublic: boolean,
) {
  const response = await fetch(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: config.secretKey, "content-type": "application/json" },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: isPublic,
      // Límites también en el proveedor, además de la validación propia.
      file_size_limit: IMAGE_MAX_BYTES,
      allowed_mime_types: Object.keys(IMAGE_TYPES),
    }),
  });
  const body = await response.text();
  if (response.ok) return console.log(`Bucket "${bucket}" creado.`);
  if (/already exists|Duplicate/i.test(body)) return console.log(`Bucket "${bucket}" ya existía.`);
  throw new Error(`No se pudo crear el bucket "${bucket}" (${response.status}): ${body}`);
}

async function main() {
  const config = getStorageConfig();
  if (!config) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno");
  }
  await createBucket(config, config.bucket, true);
  await createBucket(config, config.privateBucket, false);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
