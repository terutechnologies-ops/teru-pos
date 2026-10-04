import "server-only";

import { getStorageConfig } from "@/server/env";

import { createSupabasePrivateStorage, createSupabaseStorage } from "./supabase";
import type { FileStorage, PrivateFileStorage } from "./types";

let override: FileStorage | null = null;
let privateOverride: PrivateFileStorage | null = null;

// Pruebas: reemplaza el proveedor (p. ej. por createMemoryStorage).
export function setFileStorageForTesting(storage: FileStorage | null) {
  override = storage;
}

export function setPrivateFileStorageForTesting(storage: PrivateFileStorage | null) {
  privateOverride = storage;
}

// null si no hay proveedor configurado: las pantallas siguen funcionando
// (sin logo) y subir archivos responde con error.
export function getFileStorage(): FileStorage | null {
  if (override) return override;
  const config = getStorageConfig();
  return config ? createSupabaseStorage(config) : null;
}

// Recibos de gastos. null sin proveedor configurado (igual que el público).
export function getPrivateFileStorage(): PrivateFileStorage | null {
  if (privateOverride) return privateOverride;
  const config = getStorageConfig();
  return config ? createSupabasePrivateStorage({ ...config, bucket: config.privateBucket }) : null;
}

export type { FileStorage, PrivateFileStorage } from "./types";
