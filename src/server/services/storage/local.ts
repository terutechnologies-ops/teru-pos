import "server-only";

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FileStorage, PrivateFileStorage } from "./types";

// Solo en desarrollo: guarda los archivos en una carpeta del equipo para que
// el desarrollo nunca suba nada al almacenamiento de producción. Los sirve
// la ruta /dev/archivos, que no existe fuera de desarrollo. Los "enlaces
// firmados" de los recibos apuntan a esa misma ruta: solo es tu equipo.

export const LOCAL_FILES_ROUTE = "/dev/archivos";

// Ruta absoluta de un archivo dentro de la carpeta, o null si la ruta
// intenta salir de ella ("../", rutas absolutas).
export function resolveLocalFile(root: string, relative: string): string | null {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  return full.startsWith(base + path.sep) ? full : null;
}

// folder: subcarpeta del área ("publico" o "privado"). appUrl: las URL son
// absolutas para que el logo también se vea en los correos del outbox.
export function createLocalStorage(config: { root: string; folder: string; appUrl: string }) {
  const base = path.join(config.root, config.folder);
  const fileFor = (filePath: string) => {
    const full = resolveLocalFile(base, filePath);
    if (!full) throw new Error("Almacenamiento local: ruta fuera de la carpeta");
    return full;
  };
  const urlFor = (filePath: string) =>
    `${config.appUrl}${LOCAL_FILES_ROUTE}/${[config.folder, ...filePath.split("/")]
      .map(encodeURIComponent)
      .join("/")}`;

  const storage: FileStorage & PrivateFileStorage = {
    async upload(filePath, bytes) {
      const full = fileFor(filePath);
      await mkdir(path.dirname(full), { recursive: true });
      // wx: como Supabase con x-upsert false, nunca reemplaza un archivo.
      await writeFile(full, bytes, { flag: "wx" });
    },
    async remove(filePath) {
      await rm(fileFor(filePath), { force: true });
    },
    publicUrl(filePath) {
      return urlFor(filePath);
    },
    async signedUrl(filePath) {
      return urlFor(filePath);
    },
  };
  return storage;
}
