import "server-only";

import type { FileStorage, PrivateFileStorage } from "./types";

type SupabaseConfig = { url: string; secretKey: string };

// Supabase Storage por su API REST (sin SDK). La clave secreta va en el
// encabezado apikey; el gateway de Supabase arma la autorización.
function bucketClient(config: SupabaseConfig, bucket: string) {
  const base = `${config.url}/storage/v1`;
  const headers = { apikey: config.secretKey };
  const objectPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

  return {
    base,
    headers,
    objectPath,

    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const response = await fetch(`${base}/object/${bucket}/${objectPath(path)}`, {
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

    async remove(path: string) {
      const response = await fetch(`${base}/object/${bucket}`, {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!response.ok) {
        throw new Error(`Storage: no se pudo borrar el archivo (${response.status})`);
      }
    },
  };
}

export function createSupabaseStorage(config: SupabaseConfig & { bucket: string }): FileStorage {
  const client = bucketClient(config, config.bucket);
  return {
    upload: client.upload,
    remove: client.remove,
    publicUrl(path) {
      return `${client.base}/object/public/${config.bucket}/${client.objectPath(path)}`;
    },
  };
}

export function createSupabasePrivateStorage(
  config: SupabaseConfig & { bucket: string },
): PrivateFileStorage {
  const client = bucketClient(config, config.bucket);
  return {
    upload: client.upload,
    remove: client.remove,
    async signedUrl(path, expiresIn) {
      const response = await fetch(
        `${client.base}/object/sign/${config.bucket}/${client.objectPath(path)}`,
        {
          method: "POST",
          headers: { ...client.headers, "content-type": "application/json" },
          body: JSON.stringify({ expiresIn }),
        },
      );
      if (!response.ok) {
        throw new Error(`Storage: no se pudo firmar el enlace (${response.status})`);
      }
      // Ruta relativa a /storage/v1 ("/object/sign/...?token=...").
      const { signedURL } = (await response.json()) as { signedURL: string };
      return `${client.base}${signedURL}`;
    },
  };
}
