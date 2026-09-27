import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Catálogo de venta: categorías y productos. Todo filtra por empresa; la
// FK compuesta de products además impide usar una categoría ajena.

// P2002: nombre repetido (índice único sobre lower(name)).
// P2003: FK (categoría inexistente o de otra empresa; categoría con
// productos al borrar).
function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

export type CatalogWriteStatus = "OK" | "NOT_FOUND" | "NAME_TAKEN" | "CATEGORY_NOT_FOUND";

async function catalogWrite(write: () => Promise<number>): Promise<CatalogWriteStatus> {
  try {
    return (await write()) === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2002") return "NAME_TAKEN";
    if (code === "P2003") return "CATEGORY_NOT_FOUND";
    throw error;
  }
}

// --- Categorías -----------------------------------------------------------

export async function listProductCategories(companyId: string) {
  return db.productCategory.findMany({
    where: { companyId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      position: true,
      isActive: true,
      _count: { select: { products: true } },
    },
  });
}

// Queda al final del orden.
export async function createProductCategory(companyId: string, name: string) {
  return catalogWrite(() =>
    db.$transaction(async (tx) => {
      const last = await tx.productCategory.aggregate({
        where: { companyId },
        _max: { position: true },
      });
      await tx.productCategory.create({
        data: { companyId, name, position: (last._max.position ?? -1) + 1 },
      });
      return 1;
    }),
  );
}

export async function renameProductCategory(
  companyId: string,
  categoryId: string,
  name: string,
) {
  return catalogWrite(async () => {
    const { count } = await db.productCategory.updateMany({
      where: { id: categoryId, companyId },
      data: { name },
    });
    return count;
  });
}

export async function setProductCategoryActive(
  companyId: string,
  categoryId: string,
  isActive: boolean,
) {
  const { count } = await db.productCategory.updateMany({
    where: { id: categoryId, companyId },
    data: { isActive },
  });
  return count === 1;
}

// Sube o baja una posición. Renumera todas (0..n) para corregir huecos o
// empates que dejen altas simultáneas. false si no existe o ya está en
// el extremo.
export async function moveProductCategory(
  companyId: string,
  categoryId: string,
  direction: "up" | "down",
) {
  return db.$transaction(async (tx) => {
    const ordered = await tx.productCategory.findMany({
      where: { companyId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const index = ordered.findIndex((category) => category.id === categoryId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= ordered.length) return false;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    for (const [position, { id }] of ordered.entries()) {
      await tx.productCategory.update({ where: { id }, data: { position } });
    }
    return true;
  });
}

// Solo si nunca tuvo productos (ni archivados). true si se borró.
export async function deleteProductCategory(companyId: string, categoryId: string) {
  try {
    const { count } = await db.productCategory.deleteMany({
      where: { id: categoryId, companyId, products: { none: {} } },
    });
    return count === 1;
  } catch (error) {
    // Un producto creado entre la verificación y el borrado.
    if (prismaCode(error) === "P2003") return false;
    throw error;
  }
}

// --- Productos ------------------------------------------------------------

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  imagePath: true,
  isArchived: true,
  isAvailable: true,
  category: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.ProductSelect;

// Ordenados como en el POS: por categoría y luego alfabético.
export async function listProducts(
  companyId: string,
  filters: { search?: string; categoryId?: string; archived?: boolean } = {},
) {
  return db.product.findMany({
    where: {
      companyId,
      isArchived: filters.archived ?? false,
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
    },
    orderBy: [{ category: { position: "asc" } }, { name: "asc" }],
    select: productSelect,
  });
}

export async function findProduct(companyId: string, productId: string) {
  return db.product.findFirst({
    where: { id: productId, companyId },
    select: productSelect,
  });
}

export type ProductData = {
  categoryId: string;
  name: string;
  description: string | null;
  // Texto decimal ya validado ("16500", "4.50").
  price: string;
};

export async function createProduct(companyId: string, data: ProductData) {
  return catalogWrite(async () => {
    await db.product.create({
      data: { companyId, ...data, price: new Prisma.Decimal(data.price) },
    });
    return 1;
  });
}

export async function updateProduct(
  companyId: string,
  productId: string,
  data: ProductData,
) {
  return catalogWrite(async () => {
    const { count } = await db.product.updateMany({
      where: { id: productId, companyId },
      data: { ...data, price: new Prisma.Decimal(data.price) },
    });
    return count;
  });
}

export async function setProductArchived(
  companyId: string,
  productId: string,
  isArchived: boolean,
) {
  const { count } = await db.product.updateMany({
    where: { id: productId, companyId },
    data: { isArchived },
  });
  return count === 1;
}

export async function setProductAvailable(
  companyId: string,
  productId: string,
  isAvailable: boolean,
) {
  const { count } = await db.product.updateMany({
    where: { id: productId, companyId },
    data: { isAvailable },
  });
  return count === 1;
}
