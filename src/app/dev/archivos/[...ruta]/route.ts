import { readFile } from "node:fs/promises";

import { detectImageType } from "@/lib/images";
import { getLocalStorageDir } from "@/server/env";
import { resolveLocalFile } from "@/server/services/storage/local";

const NOT_FOUND = () => new Response("No encontrado", { status: 404 });

// Solo en desarrollo: sirve los archivos de la carpeta local
// (LOCAL_STORAGE_DIR). Fuera de desarrollo, o sin la carpeta, responde 404.
// Solo entrega imágenes, con el tipo real según sus primeros bytes.
export async function GET(_request: Request, { params }: RouteContext<"/dev/archivos/[...ruta]">) {
  const root = getLocalStorageDir();
  if (!root) return NOT_FOUND();
  const { ruta } = await params;
  const file = resolveLocalFile(root, ruta.join("/"));
  if (!file) return NOT_FOUND();

  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return NOT_FOUND();
  }
  const type = detectImageType(new Uint8Array(bytes));
  if (!type) return NOT_FOUND();
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": type, "cache-control": "no-store" },
  });
}
