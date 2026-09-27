import "server-only";

import { getStorageConfig } from "@/server/env";

import { createSupabaseStorage } from "./supabase";
import type { FileStorage } from "./types";

let override: FileStorage | null = null;

// Pruebas: reemplaza el proveedor (p. ej. por createMemoryStorage).
export function setFileStorageForTesting(storage: FileStorage | null) {
  override = storage;
}

// null si no hay proveedor configurado: las pantallas siguen funcionando
// (sin logo) y subir archivos responde con error.
export function getFileStorage(): FileStorage | null {
  if (override) return override;
  const config = getStorageConfig();
  return config ? createSupabaseStorage(config) : null;
}

export type { FileStorage } from "./types";
