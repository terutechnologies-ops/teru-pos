import "server-only";

import type { FileStorage } from "./types";

// Supabase Storage por su API REST (sin SDK). La clave secreta va en el
// encabezado apikey; el gateway de Supabase arma la autorización.
export function createSupabaseStorage(config: {
  url: string;
  secretKey: string;
  bucket: string;
}): FileStorage {
  const base = `${config.url}/storage/v1`;
  const headers = { apikey: config.secretKey };
  const objectPath = (path: string) =>
    path.split("/").map(encodeURIComponent).join("/");

  return {
    async upload(path, bytes, contentType) {
      const response = await fetch(`${base}/object/${config.bucket}/${objectPath(path)}`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": contentType,
          // Rutas únicas por archivo: el navegador puede guardarlo un año.
          "cache-control": "max-age=31536000",
          "x-upsert": "false",
        },
        // Blob: fetch no acepta Uint8Array con ArrayBufferLike en los tipos.
        body: new Blob([new Uint8Array(bytes)], { type: contentType }),
      });
      if (!response.ok) {
        throw new Error(`Storage: no se pudo subir el archivo (${response.status})`);
      }
    },

    async remove(path) {
      const response = await fetch(`${base}/object/${config.bucket}`, {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!response.ok) {
        throw new Error(`Storage: no se pudo borrar el archivo (${response.status})`);
      }
    },

    publicUrl(path) {
      return `${base}/object/public/${config.bucket}/${objectPath(path)}`;
    },
  };
}
