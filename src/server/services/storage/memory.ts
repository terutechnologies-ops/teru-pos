import type { FileStorage } from "./types";

// Solo para pruebas: guarda los archivos en memoria.
export function createMemoryStorage() {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const storage: FileStorage = {
    async upload(path, bytes, contentType) {
      files.set(path, { bytes, contentType });
    },
    async remove(path) {
      files.delete(path);
    },
    publicUrl(path) {
      return `memory://${path}`;
    },
  };
  return { storage, files };
}
