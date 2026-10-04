import type { FileStorage, PrivateFileStorage } from "./types";

// Solo para pruebas: guarda los archivos en memoria. Sirve como
// almacenamiento público y como privado.
export function createMemoryStorage() {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const storage: FileStorage & PrivateFileStorage = {
    async upload(path, bytes, contentType) {
      files.set(path, { bytes, contentType });
    },
    async remove(path) {
      files.delete(path);
    },
    publicUrl(path) {
      return `memory://${path}`;
    },
    async signedUrl(path, expiresIn) {
      return `memory-signed://${path}?expiresIn=${expiresIn}`;
    },
  };
  return { storage, files };
}
