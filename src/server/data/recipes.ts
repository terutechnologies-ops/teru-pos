import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { sameUnitFamily } from "@/lib/units";
import { lockSupply } from "@/server/data/inventory";

// Recetas: qué insumos lleva cada producto y cuánto. Todo filtra por
// empresa; las FK compuestas además impiden cruzar datos entre empresas.
// Las cantidades entran como texto decimal ya validado ("120", "0.5").

// Misma razón que en inventario: la latencia a Supabase desde fuera de su
// región hace corto el límite por defecto (5 s).
const RECIPE_TX_OPTIONS = { timeout: 20_000 };

export type RecipeLineData = {
  // Texto decimal ya validado, mayor que 0.
  quantity: string;
  // De la misma familia que la unidad del insumo.
  unit: StockUnit;
};

export type RecipeWriteStatus =
  | "OK"
  | "NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "SUPPLY_NOT_FOUND"
  | "SUPPLY_ARCHIVED"
  | "UNIT_MISMATCH"
  | "ALREADY_IN_RECIPE";

// Líneas en el orden en que se agregaron.
export async function listRecipeItems(companyId: string, productId: string) {
  return db.productRecipeItem.findMany({
    where: { companyId, productId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      quantity: true,
      unit: true,
      supply: {
        select: { id: true, name: true, unit: true, unitCost: true, isArchived: true },
      },
    },
  });
}

// Líneas de varios productos con lo necesario para costearlas (lista de
// productos): una sola consulta.
export async function listRecipeCostLines(companyId: string, productIds: string[]) {
  if (productIds.length === 0) return [];
  return db.productRecipeItem.findMany({
    where: { companyId, productId: { in: productIds } },
    select: {
      productId: true,
      quantity: true,
      unit: true,
      supply: { select: { unit: true, unitCost: true } },
    },
  });
}

// Para el servicio: a qué producto pertenece la línea (auditoría) y la
// unidad del insumo (mensajes).
export async function findRecipeItem(companyId: string, itemId: string) {
  return db.productRecipeItem.findFirst({
    where: { id: itemId, companyId },
    select: { productId: true, supply: { select: { unit: true } } },
  });
}

// Con el insumo bloqueado, su unidad no cambia de familia mientras se
// escribe la línea (updateSupply toma el mismo bloqueo).
export async function addRecipeItem(
  companyId: string,
  productId: string,
  supplyId: string,
  data: RecipeLineData,
): Promise<RecipeWriteStatus> {
  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, companyId },
        select: { id: true },
      });
      if (!product) return "PRODUCT_NOT_FOUND";

      const supply = await lockSupply(tx, companyId, supplyId);
      if (!supply) return "SUPPLY_NOT_FOUND";
      if (supply.isArchived) return "SUPPLY_ARCHIVED";
      if (!sameUnitFamily(supply.unit, data.unit)) return "UNIT_MISMATCH";

      await tx.productRecipeItem.create({
        data: {
          companyId,
          productId,
          supplyId,
          quantity: new Prisma.Decimal(data.quantity),
          unit: data.unit,
        },
      });
      return "OK";
    }, RECIPE_TX_OPTIONS);
  } catch (error) {
    // P2002: el insumo ya está en la receta (único por producto e insumo).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "ALREADY_IN_RECIPE";
    }
    throw error;
  }
}

// Cambia cantidad y unidad de una línea. Un insumo archivado se puede
// seguir ajustando o quitando de la receta, no agregando.
export async function updateRecipeItem(
  companyId: string,
  itemId: string,
  data: RecipeLineData,
): Promise<"OK" | "NOT_FOUND" | "UNIT_MISMATCH"> {
  return db.$transaction(async (tx) => {
    const item = await tx.productRecipeItem.findFirst({
      where: { id: itemId, companyId },
      select: { supplyId: true },
    });
    if (!item) return "NOT_FOUND";

    const supply = await lockSupply(tx, companyId, item.supplyId);
    if (!supply) return "NOT_FOUND";
    if (!sameUnitFamily(supply.unit, data.unit)) return "UNIT_MISMATCH";

    const { count } = await tx.productRecipeItem.updateMany({
      where: { id: itemId, companyId },
      data: { quantity: new Prisma.Decimal(data.quantity), unit: data.unit },
    });
    return count === 1 ? "OK" : "NOT_FOUND";
  }, RECIPE_TX_OPTIONS);
}

// Las líneas son configuración, no documentos: quitar una la borra.
export async function removeRecipeItem(companyId: string, itemId: string) {
  const { count } = await db.productRecipeItem.deleteMany({ where: { id: itemId, companyId } });
  return count === 1 ? ("OK" as const) : ("NOT_FOUND" as const);
}
