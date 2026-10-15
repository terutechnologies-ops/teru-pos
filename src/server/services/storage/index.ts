import "server-only";

import { getAppUrl, getLocalStorageDir, getStorageConfig } from "@/server/env";

import { createLocalStorage } from "./local";
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

function localStorageFor(folder: "publico" | "privado") {
  const root = getLocalStorageDir();
  return root ? createLocalStorage({ root, folder, appUrl: getAppUrl() }) : null;
}

// null si no hay proveedor configurado: las pantallas siguen funcionando
// (sin logo) y subir archivos responde con error. En desarrollo, con
// LOCAL_STORAGE_DIR, la carpeta local.
export function getFileStorage(): FileStorage | null {
  if (override) return override;
  const local = localStorageFor("publico");
  if (local) return local;
  const config = getStorageConfig();
  return config ? createSupabaseStorage(config) : null;
}

// Recibos de gastos. null sin proveedor configurado (igual que el público).
export function getPrivateFileStorage(): PrivateFileStorage | null {
  if (privateOverride) return privateOverride;
  const local = localStorageFor("privado");
  if (local) return local;
  const config = getStorageConfig();
  return config ? createSupabasePrivateStorage({ ...config, bucket: config.privateBucket }) : null;
}

export type { FileStorage, PrivateFileStorage } from "./types";
