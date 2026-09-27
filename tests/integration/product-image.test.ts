import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { PRODUCT_EVENTS } from "@/server/services/auth/config";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createCatalogProduct,
  getProductCatalog,
  removeProductImage,
  updateProductImage,
} from "@/server/services/catalog";
import { setFileStorageForTesting } from "@/server/services/storage";
import { createMemoryStorage } from "@/server/services/storage/memory";

import { cleanupCompanies, createCompany, ctx, uniqueTag } from "../helpers";

const tag = uniqueTag("product-image");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let productId: string;
let categoryId: string;
let memory: ReturnType<typeof createMemoryStorage>;

const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 datos");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const blob = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]);

function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  const category = await db.productCategory.create({
    data: { companyId: a.id, name: "Arepas", position: 0 },
  });
  categoryId = category.id;
  ({ id: productId } = await db.product.create({
    data: { companyId: a.id, categoryId: category.id, name: "Catira", price: 9000 },
  }));
});
beforeEach(() => {
  memory = createMemoryStorage();
  setFileStorageForTesting(memory.storage);
});
afterAll(async () => {
  setFileStorageForTesting(null);
  await cleanupCompanies(tag);
});

const imagePath = async () =>
  (await db.product.findUniqueOrThrow({ where: { id: productId } })).imagePath;
const events = (action: string) =>
  db.authAuditLog.count({ where: { action, targetType: "PRODUCT", targetId: productId } });

describe("foto del producto", () => {
  it("sube, reemplaza borrando la anterior y quita", async () => {
    const admin = sessionFor(a, "ADMIN");
    expect(await updateProductImage(admin, productId, blob(WEBP), ctx(tag))).toEqual({ ok: true });
    const first = await imagePath();
    expect(first).toMatch(new RegExp(`^companies/${a.id}/products/${productId}-[\\w-]+\\.webp$`));

    const { products } = await getProductCatalog(admin, {});
    expect(products[0].imageUrl).toBe(`memory://${first}`);

    expect(await updateProductImage(admin, productId, blob(PNG), ctx(tag))).toEqual({ ok: true });
    const second = await imagePath();
    expect(second).toMatch(/\.png$/);
    expect(memory.files.has(first!)).toBe(false);
    expect(memory.files.has(second!)).toBe(true);

    expect(await removeProductImage(admin, productId, ctx(tag))).toEqual({ ok: true });
    expect(await imagePath()).toBeNull();
    expect(memory.files.size).toBe(0);
    // Quitar sin foto no registra otro evento.
    expect(await removeProductImage(admin, productId, ctx(tag))).toEqual({ ok: true });

    expect(await events(PRODUCT_EVENTS.IMAGE_UPDATED)).toBe(2);
    expect(await events(PRODUCT_EVENTS.IMAGE_REMOVED)).toBe(1);
  });

  it("rechaza archivos no válidos sin tocar el producto", async () => {
    const svg = new TextEncoder().encode("<svg/>");
    expect(await updateProductImage(sessionFor(a, "OWNER"), productId, blob(svg), ctx(tag)))
      .toEqual({ ok: false, error: "Usa una imagen PNG, JPG o WebP." });
    expect(await imagePath()).toBeNull();
    expect(memory.files.size).toBe(0);
  });

  it("no toca productos de otra empresa ni sube el archivo", async () => {
    const other = sessionFor(b, "OWNER");
    expect(await updateProductImage(other, productId, blob(PNG), ctx(tag))).toMatchObject({
      ok: false,
    });
    expect(await removeProductImage(other, productId, ctx(tag))).toMatchObject({ ok: false });
    expect(memory.files.size).toBe(0);
  });

  it("el personal no gestiona fotos", async () => {
    const staff = sessionFor(a, "STAFF");
    await expect(updateProductImage(staff, productId, blob(PNG), ctx(tag))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(removeProductImage(staff, productId, ctx(tag))).rejects.toThrow(ForbiddenError);
  });

  describe("al crear el producto", () => {
    const input = (name: string) => ({ name, categoryId, description: "", price: "5000" });
    const byName = (name: string) =>
      db.product.findFirst({ where: { companyId: a.id, name } });

    it("sube la foto en el mismo paso", async () => {
      const result = await createCatalogProduct(
        sessionFor(a, "OWNER"),
        input("Con foto"),
        ctx(tag),
        blob(WEBP),
      );
      expect(result).toMatchObject({ ok: true, imageFailed: false });
      const product = await byName("Con foto");
      expect(product?.imagePath).toMatch(/\.webp$/);
      expect(memory.files.has(product!.imagePath!)).toBe(true);
      const actions = await db.authAuditLog.findMany({
        where: { targetType: "PRODUCT", targetId: product!.id },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      });
      expect(actions.map((e) => e.action)).toEqual([
        PRODUCT_EVENTS.CREATED,
        PRODUCT_EVENTS.IMAGE_UPDATED,
      ]);
    });

    it("sin foto (campo vacío) crea normal", async () => {
      const result = await createCatalogProduct(
        sessionFor(a, "OWNER"),
        input("Sin foto"),
        ctx(tag),
        blob(new Uint8Array()),
      );
      expect(result).toMatchObject({ ok: true });
      expect((await byName("Sin foto"))?.imagePath).toBeNull();
    });

    it("una foto inválida no crea nada y se informa junto a los demás errores", async () => {
      const svg = new TextEncoder().encode("<svg/>");
      const result = await createCatalogProduct(
        sessionFor(a, "OWNER"),
        { ...input("X"), price: "4.5" },
        ctx(tag),
        blob(svg),
      );
      expect(result).toEqual({
        ok: false,
        fieldErrors: {
          name: expect.any(String),
          price: "Esta moneda no usa centavos.",
          image: "Usa una imagen PNG, JPG o WebP.",
        },
      });
      expect(await byName("X")).toBeNull();
      expect(memory.files.size).toBe(0);
    });

    it("si falla la subida, el producto queda creado sin foto", async () => {
      setFileStorageForTesting({
        ...memory.storage,
        upload: async () => {
          throw new Error("Storage caído");
        },
      });
      const result = await createCatalogProduct(
        sessionFor(a, "OWNER"),
        input("Foto fallida"),
        ctx(tag),
        blob(PNG),
      );
      expect(result).toMatchObject({ ok: true, imageFailed: true });
      expect((await byName("Foto fallida"))?.imagePath).toBeNull();
    });
  });
});
