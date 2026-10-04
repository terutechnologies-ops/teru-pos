import "server-only";

import { randomUUID } from "node:crypto";

import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  detectImageType,
  type ImageType,
} from "@/lib/images";
import { getFileStorage } from "@/server/services/storage";

// Guardar imágenes (logo, fotos de productos) en el almacenamiento de
// archivos: validar, subir con ruta única, apuntar a la nueva y borrar la
// anterior.

export type ImageResult = { ok: true } | { ok: false; error: string };

// URL pública, o null si no hay imagen o no hay almacenamiento.
export function publicFileUrl(path: string | null) {
  if (!path) return null;
  return getFileStorage()?.publicUrl(path) ?? null;
}

// Borrar no debe hacer fallar la operación: si falla, queda un archivo
// huérfano, no una imagen rota.
export async function removeFileQuietly(path: string) {
  try {
    await getFileStorage()?.remove(path);
  } catch (error) {
    console.error("removeFileQuietly: no se pudo borrar", (error as Error).message);
  }
}

export type ValidImage = { bytes: Uint8Array; type: ImageType };

type ValidImageResult = { ok: true; image: ValidImage } | { ok: false; error: string };

export const NO_STORAGE = {
  ok: false as const,
  error: "No hay almacenamiento de archivos configurado.",
};

// Valida sin subir nada (sirve para rechazar antes de crear el dueño de la
// imagen, p. ej. un producto nuevo).
export async function validateImage(file: Blob | null): Promise<ValidImageResult> {
  if (!getFileStorage()) return NO_STORAGE;
  return checkImageFile(file);
}

// Tamaño y tipo real del archivo, sin mirar el almacenamiento (lo usan
// también los recibos, que van al privado).
export async function checkImageFile(file: Blob | null): Promise<ValidImageResult> {
  if (!file || file.size === 0) return { ok: false, error: "Elige una imagen." };
  if (file.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "La imagen no puede superar 1 MB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "Usa una imagen PNG, JPG o WebP." };
  return { ok: true, image: { bytes, type } };
}

// `savePath` guarda la ruta nueva y devuelve la anterior (o null). Si
// falla, se borra el archivo recién subido. La ruta es única en cada
// subida: así se puede servir con caché larga sin mostrar la versión vieja.
export async function replaceImage(params: {
  file: Blob | null;
  // Sin extensión: p. ej. "companies/{id}/logo".
  pathPrefix: string;
  savePath: (path: string) => Promise<string | null>;
}): Promise<ImageResult> {
  const valid = await validateImage(params.file);
  if (!valid.ok) return valid;
  const { bytes, type } = valid.image;
  const storage = getFileStorage()!;

  const path = `${params.pathPrefix}-${randomUUID()}.${IMAGE_TYPES[type]}`;
  await storage.upload(path, bytes, type);
  let previous: string | null;
  try {
    previous = await params.savePath(path);
  } catch (error) {
    await removeFileQuietly(path);
    throw error;
  }
  if (previous) await removeFileQuietly(previous);
  return { ok: true };
}
