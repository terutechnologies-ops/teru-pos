import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/dev/archivos/[...ruta]/route";
import { getFileStorage, getPrivateFileStorage } from "@/server/services/storage";
import { createLocalStorage, resolveLocalFile } from "@/server/services/storage/local";

// PNG mínimo: basta con la firma para que se reconozca como imagen.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let root: string;

function request(ruta: string[]) {
  return GET(new Request("http://localhost/dev/archivos"), {
    params: Promise.resolve({ ruta }),
  } as Parameters<typeof GET>[1]);
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "teru-archivos-"));
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rm(root, { recursive: true, force: true }));

describe("almacenamiento local de desarrollo", () => {
  it("guarda, arma la URL absoluta y borra dentro de su carpeta", async () => {
    const storage = createLocalStorage({ root, folder: "publico", appUrl: "http://localhost:3000" });
    await storage.upload("companies/c1/logo-1.png", PNG, "image/png");
    expect(await readFile(path.join(root, "publico", "companies", "c1", "logo-1.png"))).toEqual(
      Buffer.from(PNG),
    );
    expect(storage.publicUrl("companies/c1/logo 1.png")).toBe(
      "http://localhost:3000/dev/archivos/publico/companies/c1/logo%201.png",
    );
    // Como Supabase con x-upsert false: no reemplaza un archivo.
    await expect(storage.upload("companies/c1/logo-1.png", PNG, "image/png")).rejects.toThrow();
    await storage.remove("companies/c1/logo-1.png");
    await storage.remove("companies/c1/no-existe.png");
    await expect(readFile(path.join(root, "publico", "companies", "c1", "logo-1.png"))).rejects.toThrow();

    await expect(storage.upload("../fuera.png", PNG, "image/png")).rejects.toThrow("fuera de la carpeta");
    expect(resolveLocalFile(root, "../x")).toBeNull();
    expect(resolveLocalFile(root, path.resolve(root, "..", "x"))).toBeNull();
    expect(resolveLocalFile(root, "publico/a.png")).toBe(path.join(root, "publico", "a.png"));
  });

  it("solo se usa en desarrollo y con LOCAL_STORAGE_DIR, y gana sobre Supabase", async () => {
    vi.stubEnv("SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_prueba");
    vi.stubEnv("LOCAL_STORAGE_DIR", root);
    vi.stubEnv("APP_URL", "http://localhost:3000");
    // Las pruebas corren con NODE_ENV=test: la carpeta se ignora.
    expect(getFileStorage()?.publicUrl("a.png")).toContain("ejemplo.supabase.co");

    vi.stubEnv("NODE_ENV", "development");
    expect(getFileStorage()?.publicUrl("a.png")).toBe("http://localhost:3000/dev/archivos/publico/a.png");
    expect(await getPrivateFileStorage()?.signedUrl("r/1.png", 60)).toBe(
      "http://localhost:3000/dev/archivos/privado/r/1.png",
    );
  });

  it("la ruta sirve imágenes de la carpeta solo en desarrollo", async () => {
    await writeFile(path.join(root, "foto.png"), PNG);
    await writeFile(path.join(root, "nota.txt"), "hola");
    vi.stubEnv("LOCAL_STORAGE_DIR", root);

    vi.stubEnv("NODE_ENV", "production");
    expect((await request(["foto.png"])).status).toBe(404);

    vi.stubEnv("NODE_ENV", "development");
    const ok = await request(["foto.png"]);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(PNG);
    expect((await request(["nota.txt"])).status).toBe(404);
    expect((await request(["no-existe.png"])).status).toBe(404);
    expect((await request(["..", "fuera.png"])).status).toBe(404);
  });
});
