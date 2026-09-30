import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockMovementType, StockUnit } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { sameUnitFamily } from "@/lib/units";

// Inventario: bodegas, insumos, saldos y movimientos. Todo filtra por
// empresa; las FK compuestas además impiden cruzar datos entre empresas.
// Las cantidades entran como texto decimal ya validado ("2.5", "-3").

export const MAIN_WAREHOUSE_NAME = "Bodega principal";

// Cada consulta a Supabase tarda ~0,8 s desde fuera de su región: el
// movimiento hace varias dentro de la transacción y el límite por defecto
// (5 s) se queda corto.
const MOVEMENT_TX_OPTIONS = { timeout: 20_000 };

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

export type InventoryWriteStatus = "OK" | "NOT_FOUND" | "NAME_TAKEN" | "BRANCH_NOT_FOUND";

// P2002: nombre repetido (índice único sobre lower(name)).
// P2003: sucursal inexistente o de otra empresa (FK compuesta).
async function inventoryWrite(write: () => Promise<number>): Promise<InventoryWriteStatus> {
  try {
    return (await write()) === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2002") return "NAME_TAKEN";
    if (code === "P2003") return "BRANCH_NOT_FOUND";
    throw error;
  }
}

// --- Bodegas --------------------------------------------------------------

// La crea el alta de la empresa junto con su sucursal principal.
export async function createMainWarehouse(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId: string,
) {
  return tx.warehouse.create({
    data: { companyId, branchId, name: MAIN_WAREHOUSE_NAME, isMain: true },
    select: { id: true },
  });
}

const warehouseSelect = {
  id: true,
  name: true,
  isMain: true,
  isActive: true,
  branch: { select: { id: true, name: true, isMain: true } },
  // Insumos con existencias en la bodega.
  _count: { select: { stockLevels: { where: { quantity: { gt: 0 } } } } },
} satisfies Prisma.WarehouseSelect;

// Agrupables por sucursal: la principal primero y, dentro de cada una, su
// bodega principal primero.
export async function listWarehouses(companyId: string) {
  return db.warehouse.findMany({
    where: { companyId },
    orderBy: [
      { branch: { isMain: "desc" } },
      { branch: { name: "asc" } },
      { isMain: "desc" },
      { name: "asc" },
    ],
    select: warehouseSelect,
  });
}

export async function findWarehouse(companyId: string, warehouseId: string) {
  return db.warehouse.findFirst({
    where: { id: warehouseId, companyId },
    select: warehouseSelect,
  });
}

export async function createWarehouse(companyId: string, branchId: string, name: string) {
  return inventoryWrite(async () => {
    await db.warehouse.create({ data: { companyId, branchId, name } });
    return 1;
  });
}

export async function renameWarehouse(companyId: string, warehouseId: string, name: string) {
  return inventoryWrite(async () => {
    const { count } = await db.warehouse.updateMany({
      where: { id: warehouseId, companyId },
      data: { name },
    });
    return count;
  });
}

// Bloquea la fila de la bodega hasta el fin de la transacción. Los
// movimientos la toman compartida (FOR SHARE): corren en paralelo entre sí,
// pero no mientras se desactiva (FOR UPDATE).
async function lockWarehouse(
  tx: Prisma.TransactionClient,
  companyId: string,
  warehouseId: string,
  mode: "SHARE" | "UPDATE",
) {
  const rows =
    mode === "SHARE"
      ? await tx.$queryRaw<{ isMain: boolean; isActive: boolean }[]>`
          SELECT "isMain", "isActive" FROM "warehouses"
          WHERE "id" = ${warehouseId} AND "companyId" = ${companyId}
          FOR SHARE`
      : await tx.$queryRaw<{ isMain: boolean; isActive: boolean }[]>`
          SELECT "isMain", "isActive" FROM "warehouses"
          WHERE "id" = ${warehouseId} AND "companyId" = ${companyId}
          FOR UPDATE`;
  return rows[0] ?? null;
}

// La principal no se desactiva (es la bodega por defecto de su sucursal),
// ni una con existencias (quedarían sin poder moverse). Con la bodega
// bloqueada, ningún movimiento le agrega saldo en medio.
export async function setWarehouseActive(
  companyId: string,
  warehouseId: string,
  isActive: boolean,
): Promise<"OK" | "NOT_FOUND" | "IS_MAIN" | "HAS_STOCK"> {
  if (isActive) {
    const { count } = await db.warehouse.updateMany({
      where: { id: warehouseId, companyId },
      data: { isActive },
    });
    return count === 1 ? "OK" : "NOT_FOUND";
  }
  return db.$transaction(async (tx) => {
    const warehouse = await lockWarehouse(tx, companyId, warehouseId, "UPDATE");
    if (!warehouse) return "NOT_FOUND";
    if (warehouse.isMain) return "IS_MAIN";
    const stocked = await tx.stockLevel.count({
      where: { companyId, warehouseId, quantity: { gt: 0 } },
    });
    if (stocked > 0) return "HAS_STOCK";
    await tx.warehouse.update({ where: { id: warehouseId }, data: { isActive } });
    return "OK";
  }, MOVEMENT_TX_OPTIONS);
}

// --- Insumos --------------------------------------------------------------

const supplySelect = {
  id: true,
  name: true,
  unit: true,
  minStock: true,
  unitCost: true,
  isArchived: true,
  stockLevels: { select: { warehouseId: true, quantity: true } },
} satisfies Prisma.SupplySelect;

export async function listSupplies(
  companyId: string,
  filters: { search?: string; archived?: boolean } = {},
) {
  return db.supply.findMany({
    where: {
      companyId,
      isArchived: filters.archived ?? false,
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
    },
    orderBy: { name: "asc" },
    select: supplySelect,
  });
}

export async function findSupply(companyId: string, supplyId: string) {
  return db.supply.findFirst({
    where: { id: supplyId, companyId },
    select: {
      ...supplySelect,
      _count: { select: { stockMovements: true } },
    },
  });
}

export type SupplyData = {
  name: string;
  unit: StockUnit;
  // Textos decimales ya validados; null = sin mínimo / sin costo.
  minStock: string | null;
  unitCost: string | null;
};

const decimalOrNull = (value: string | null) =>
  value === null ? null : new Prisma.Decimal(value);

function supplyRow(data: SupplyData) {
  return {
    ...data,
    minStock: decimalOrNull(data.minStock),
    unitCost: decimalOrNull(data.unitCost),
  };
}

export async function createSupply(companyId: string, data: SupplyData) {
  let id: string | null = null;
  const status = await inventoryWrite(async () => {
    ({ id } = await db.supply.create({
      data: { companyId, ...supplyRow(data) },
      select: { id: true },
    }));
    return 1;
  });
  return { status, id };
}

// Bloquea la fila del insumo hasta el fin de la transacción. Serializa los
// movimientos de un mismo insumo entre sí, con el cambio de su unidad y con
// las líneas de receta que lo usan (data/recipes.ts).
export async function lockSupply(tx: Prisma.TransactionClient, companyId: string, supplyId: string) {
  const rows = await tx.$queryRaw<{ unit: StockUnit; isArchived: boolean }[]>`
    SELECT "unit", "isArchived" FROM "supplies"
    WHERE "id" = ${supplyId} AND "companyId" = ${companyId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

// La unidad solo cambia si el insumo no tiene movimientos: sus cantidades
// quedarían expresadas en otra unidad. Si está en recetas, solo dentro de
// su familia (las líneas llevan su propia unidad y se siguen convirtiendo).
export async function updateSupply(
  companyId: string,
  supplyId: string,
  data: SupplyData,
): Promise<InventoryWriteStatus | "UNIT_LOCKED" | "UNIT_IN_RECIPES"> {
  try {
    return await db.$transaction(async (tx) => {
      const current = await lockSupply(tx, companyId, supplyId);
      if (!current) return "NOT_FOUND";
      if (current.unit !== data.unit) {
        const movements = await tx.stockMovement.count({ where: { companyId, supplyId } });
        if (movements > 0) return "UNIT_LOCKED";
        if (!sameUnitFamily(current.unit, data.unit)) {
          const recipes = await tx.productRecipeItem.count({ where: { companyId, supplyId } });
          if (recipes > 0) return "UNIT_IN_RECIPES";
        }
      }
      await tx.supply.update({ where: { id: supplyId }, data: supplyRow(data) });
      return "OK";
    }, MOVEMENT_TX_OPTIONS);
  } catch (error) {
    if (prismaCode(error) === "P2002") return "NAME_TAKEN";
    throw error;
  }
}

// No se archiva con existencias: quedarían ocultas y sin poder moverse.
// Con el insumo bloqueado, ningún movimiento cambia el saldo en medio.
export async function setSupplyArchived(
  companyId: string,
  supplyId: string,
  isArchived: boolean,
): Promise<"OK" | "NOT_FOUND" | "HAS_STOCK"> {
  return db.$transaction(async (tx) => {
    if (!(await lockSupply(tx, companyId, supplyId))) return "NOT_FOUND";
    if (isArchived) {
      const stocked = await tx.stockLevel.count({
        where: { companyId, supplyId, quantity: { gt: 0 } },
      });
      if (stocked > 0) return "HAS_STOCK";
    }
    await tx.supply.update({ where: { id: supplyId }, data: { isArchived } });
    return "OK";
  }, MOVEMENT_TX_OPTIONS);
}

// --- Saldos y movimientos -------------------------------------------------

export type StockMovementInput = {
  warehouseId: string;
  supplyId: string;
  type: StockMovementType;
  // Con signo: + entra, − sale. Ya validado (distinto de 0).
  quantity: string;
  reason: string | null;
  userId: string;
};

export type StockMovementResult =
  | { status: "OK"; movementId: string; balance: Prisma.Decimal }
  | {
      status:
        | "SUPPLY_NOT_FOUND"
        | "SUPPLY_ARCHIVED"
        | "WAREHOUSE_NOT_FOUND"
        | "WAREHOUSE_INACTIVE"
        | "ALREADY_INITIALIZED";
    }
  // available: saldo de la bodega, en la unidad del insumo.
  | { status: "INSUFFICIENT_STOCK"; available: Prisma.Decimal; unit: StockUnit };

// Registra el movimiento y actualiza el saldo en la misma transacción. Con
// el insumo bloqueado, leer el saldo y escribirlo después es seguro. El
// saldo nunca queda negativo (también lo impide un CHECK en la BD).
export async function recordStockMovement(
  companyId: string,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  const quantity = new Prisma.Decimal(input.quantity);

  return db.$transaction(async (tx) => {
    const supply = await lockSupply(tx, companyId, input.supplyId);
    if (!supply) return { status: "SUPPLY_NOT_FOUND" };
    if (supply.isArchived) return { status: "SUPPLY_ARCHIVED" };

    const warehouse = await lockWarehouse(tx, companyId, input.warehouseId, "SHARE");
    if (!warehouse) return { status: "WAREHOUSE_NOT_FOUND" };
    if (!warehouse.isActive) return { status: "WAREHOUSE_INACTIVE" };

    const key = { warehouseId: input.warehouseId, supplyId: input.supplyId };
    if (input.type === "INITIAL") {
      const previous = await tx.stockMovement.count({ where: { companyId, ...key } });
      if (previous > 0) return { status: "ALREADY_INITIALIZED" };
    }

    const level = await tx.stockLevel.findUnique({
      where: { warehouseId_supplyId: key },
      select: { quantity: true },
    });
    const available = level?.quantity ?? new Prisma.Decimal(0);
    const balance = available.plus(quantity);
    if (balance.isNegative()) {
      return { status: "INSUFFICIENT_STOCK", available, unit: supply.unit };
    }

    await tx.stockLevel.upsert({
      where: { warehouseId_supplyId: key },
      create: { companyId, ...key, quantity: balance },
      update: { quantity: balance },
    });
    const movement = await tx.stockMovement.create({
      data: {
        companyId,
        ...key,
        type: input.type,
        quantity,
        balanceAfter: balance,
        reason: input.reason,
        userId: input.userId,
      },
      select: { id: true },
    });
    return { status: "OK", movementId: movement.id, balance };
  }, MOVEMENT_TX_OPTIONS);
}

// Kardex de un insumo, del más reciente al más antiguo.
export async function listStockMovements(
  companyId: string,
  supplyId: string,
  filters: { warehouseId?: string; take?: number } = {},
) {
  return db.stockMovement.findMany({
    where: {
      companyId,
      supplyId,
      ...(filters.warehouseId && { warehouseId: filters.warehouseId }),
    },
    // El id desempata movimientos del mismo milisegundo.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filters.take ?? 100,
    select: {
      id: true,
      type: true,
      quantity: true,
      balanceAfter: true,
      reason: true,
      createdAt: true,
      warehouse: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
}
