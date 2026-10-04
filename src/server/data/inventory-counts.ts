import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { lockWarehouse } from "@/server/data/inventory";

// Conteo físico por bodega (ver ADR 0009). Se arma en borrador; al
// confirmarse, cada línea se compara con el saldo del sistema de ese
// momento y la diferencia entra al kardex (COUNT). Confirmado no cambia ni
// se anula. Las cantidades entran como texto decimal ya validado.
//
// La confirmación bloquea, lee y escribe por lotes: un conteo puede tener
// decenas de insumos y, con la latencia a Supabase, una consulta por línea
// agotaría el tiempo de la transacción.

const COUNT_TX_OPTIONS = { timeout: 30_000 };

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

// Bloquea el conteo hasta el fin de la transacción: las escrituras de un
// mismo borrador (líneas, confirmar, borrar) no se cruzan.
async function lockCount(tx: Prisma.TransactionClient, companyId: string, countId: string) {
  const rows = await tx.$queryRaw<{ status: string; warehouseId: string }[]>`
    SELECT "status"::text AS "status", "warehouseId" FROM "inventory_counts"
    WHERE "id" = ${countId} AND "companyId" = ${companyId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

// --- Borrador ---------------------------------------------------------------

export type CreateCountResult =
  | { status: "OK"; countId: string }
  | { status: "WAREHOUSE_NOT_FOUND" | "WAREHOUSE_INACTIVE" }
  // La bodega ya tiene un borrador (uno solo por bodega): se retoma ese.
  | { status: "DRAFT_EXISTS"; countId: string };

export async function createInventoryCountDraft(
  companyId: string,
  input: { warehouseId: string; userId: string },
): Promise<CreateCountResult> {
  const warehouse = await db.warehouse.findFirst({
    where: { id: input.warehouseId, companyId },
    select: { isActive: true },
  });
  if (!warehouse) return { status: "WAREHOUSE_NOT_FOUND" };
  if (!warehouse.isActive) return { status: "WAREHOUSE_INACTIVE" };

  try {
    const count = await db.inventoryCount.create({
      data: { companyId, warehouseId: input.warehouseId, createdById: input.userId },
      select: { id: true },
    });
    return { status: "OK", countId: count.id };
  } catch (error) {
    // Índice parcial inventory_counts_one_draft_per_warehouse.
    if (prismaCode(error) !== "P2002") throw error;
    const draft = await findWarehouseDraftCount(companyId, input.warehouseId);
    if (!draft) throw error;
    return { status: "DRAFT_EXISTS", countId: draft.id };
  }
}

export async function findWarehouseDraftCount(companyId: string, warehouseId: string) {
  return db.inventoryCount.findFirst({
    where: { companyId, warehouseId, status: "DRAFT" },
    select: { id: true },
  });
}

export type CountDraftStatus = "OK" | "NOT_FOUND" | "NOT_DRAFT";

// Un borrador no es un documento: se borra con sus líneas.
export async function deleteInventoryCountDraft(
  companyId: string,
  countId: string,
): Promise<{ status: CountDraftStatus }> {
  return db.$transaction(async (tx) => {
    const count = await lockCount(tx, companyId, countId);
    if (!count) return { status: "NOT_FOUND" };
    if (count.status !== "DRAFT") return { status: "NOT_DRAFT" };
    await tx.inventoryCountLine.deleteMany({ where: { companyId, countId } });
    await tx.inventoryCount.delete({ where: { id: countId } });
    return { status: "OK" };
  });
}

export type CountEntry = {
  supplyId: string;
  // Lo contado (>= 0) en `unit`; null = en blanco (se quita la línea: ese
  // insumo no se cuenta).
  countedQuantity: string | null;
  // La unidad que vio quien contó. Si el insumo ya tiene otra, lo contado
  // no se guarda: estaría expresado en otra unidad.
  unit: StockUnit;
};

export type SaveCountLinesResult =
  | { status: CountDraftStatus }
  | { status: "SUPPLY_NOT_FOUND" | "SUPPLY_ARCHIVED" | "UNIT_CHANGED"; supplyId: string };

// Guarda lo escrito en el formulario: crea o cambia las líneas con valor y
// quita las que quedaron en blanco. Los insumos que no vienen no se tocan.
export async function saveInventoryCountLines(
  companyId: string,
  countId: string,
  entries: CountEntry[],
): Promise<SaveCountLinesResult> {
  return db.$transaction(async (tx) => {
    const count = await lockCount(tx, companyId, countId);
    if (!count) return { status: "NOT_FOUND" };
    if (count.status !== "DRAFT") return { status: "NOT_DRAFT" };

    const filled = entries.filter((entry) => entry.countedQuantity !== null);
    const supplies = await tx.supply.findMany({
      where: { companyId, id: { in: filled.map((entry) => entry.supplyId) } },
      select: { id: true, unit: true, isArchived: true },
    });
    const byId = new Map(supplies.map((supply) => [supply.id, supply]));
    // Todo se valida antes de escribir (devolver un error no deshace).
    for (const { supplyId, unit } of filled) {
      const supply = byId.get(supplyId);
      if (!supply) return { status: "SUPPLY_NOT_FOUND", supplyId };
      if (supply.isArchived) return { status: "SUPPLY_ARCHIVED", supplyId };
      if (supply.unit !== unit) return { status: "UNIT_CHANGED", supplyId };
    }

    const blank = entries.filter((entry) => entry.countedQuantity === null);
    if (blank.length > 0) {
      await tx.inventoryCountLine.deleteMany({
        where: { companyId, countId, supplyId: { in: blank.map((entry) => entry.supplyId) } },
      });
    }
    for (const entry of filled) {
      const countedQuantity = new Prisma.Decimal(entry.countedQuantity!);
      // Si la unidad cambia antes de confirmar, la confirmación lo detecta.
      const { unit } = entry;
      await tx.inventoryCountLine.upsert({
        where: { countId_supplyId: { countId, supplyId: entry.supplyId } },
        create: { companyId, countId, supplyId: entry.supplyId, unit, countedQuantity },
        update: { unit, countedQuantity },
      });
    }
    return { status: "OK" };
  });
}

// --- Confirmar ---------------------------------------------------------------

export type ConfirmCountResult =
  | { status: "OK"; number: number }
  | { status: "NOT_FOUND" | "NOT_DRAFT" | "EMPTY" | "WAREHOUSE_INACTIVE" }
  | { status: "SUPPLY_ARCHIVED" | "UNIT_CHANGED"; supplyId: string };

type PreviousCount = { supplyId: string; confirmedAt: Date; countedQuantity: Prisma.Decimal };
type MovementSum = { supplyId: string; type: string; total: Prisma.Decimal };

const ZERO = new Prisma.Decimal(0);

// Compara cada línea con el saldo actual de la bodega (sin saldo = 0),
// escribe la diferencia como movimiento COUNT (solo si no es cero), guarda
// el período desde el conteo anterior de cada insumo en la bodega y asigna
// el consecutivo, todo en una transacción.
export async function confirmInventoryCount(
  companyId: string,
  input: { countId: string; userId: string },
): Promise<ConfirmCountResult> {
  return db.$transaction(async (tx) => {
    const count = await lockCount(tx, companyId, input.countId);
    if (!count) return { status: "NOT_FOUND" };
    if (count.status !== "DRAFT") return { status: "NOT_DRAFT" };
    const { warehouseId } = count;

    const lines = await tx.inventoryCountLine.findMany({
      where: { companyId, countId: input.countId },
      orderBy: { supplyId: "asc" },
      select: { id: true, supplyId: true, unit: true, countedQuantity: true },
    });
    if (lines.length === 0) return { status: "EMPTY" };

    const warehouse = await lockWarehouse(tx, companyId, warehouseId, "SHARE");
    if (!warehouse?.isActive) return { status: "WAREHOUSE_INACTIVE" };

    // Todos los insumos de una vez y en orden fijo (como ventas y compras):
    // FOR UPDATE bloquea las filas en el orden en que salen.
    const supplyIds = lines.map((line) => line.supplyId);
    const supplies = await tx.$queryRaw<
      { id: string; unit: StockUnit; isArchived: boolean; unitCost: Prisma.Decimal | null }[]
    >`
      SELECT "id", "unit", "isArchived", "unitCost" FROM "supplies"
      WHERE "companyId" = ${companyId} AND "id" = ANY(${supplyIds})
      ORDER BY "id"
      FOR UPDATE`;
    const supplyById = new Map(supplies.map((supply) => [supply.id, supply]));
    // Todo se valida antes de escribir (devolver un error no deshace).
    for (const line of lines) {
      const supply = supplyById.get(line.supplyId);
      if (!supply) throw new Error(`Insumo de conteo inexistente: ${line.supplyId}`);
      if (supply.isArchived) return { status: "SUPPLY_ARCHIVED", supplyId: line.supplyId };
      if (supply.unit !== line.unit) return { status: "UNIT_CHANGED", supplyId: line.supplyId };
    }

    // Con los insumos bloqueados, nada más mueve sus saldos: lo leído es
    // exactamente lo que el sistema tiene.
    const levels = await tx.stockLevel.findMany({
      where: { companyId, warehouseId, supplyId: { in: supplyIds } },
      select: { supplyId: true, quantity: true },
    });
    const levelBySupply = new Map(levels.map((level) => [level.supplyId, level.quantity]));

    // Último conteo confirmado de cada insumo en esta bodega.
    const previous = await tx.$queryRaw<PreviousCount[]>`
      SELECT DISTINCT ON (l."supplyId") l."supplyId", c."confirmedAt", l."countedQuantity"
      FROM "inventory_count_lines" l
      JOIN "inventory_counts" c ON c."id" = l."countId"
      WHERE c."companyId" = ${companyId} AND c."warehouseId" = ${warehouseId}
        AND c."status" = 'CONFIRMED' AND l."supplyId" = ANY(${supplyIds})
      ORDER BY l."supplyId", c."confirmedAt" DESC`;
    const previousBySupply = new Map(previous.map((row) => [row.supplyId, row]));

    // Movimientos netos de cada insumo desde su conteo anterior (o desde el
    // primero). Los del conteo anterior llevan su misma hora y quedan fuera.
    const sums = await tx.$queryRaw<MovementSum[]>`
      SELECT m."supplyId", m."type"::text AS "type", SUM(m."quantity") AS "total"
      FROM "stock_movements" m
      LEFT JOIN (
        SELECT DISTINCT ON (l."supplyId") l."supplyId", c."confirmedAt"
        FROM "inventory_count_lines" l
        JOIN "inventory_counts" c ON c."id" = l."countId"
        WHERE c."companyId" = ${companyId} AND c."warehouseId" = ${warehouseId}
          AND c."status" = 'CONFIRMED' AND l."supplyId" = ANY(${supplyIds})
        ORDER BY l."supplyId", c."confirmedAt" DESC
      ) p ON p."supplyId" = m."supplyId"
      WHERE m."companyId" = ${companyId} AND m."warehouseId" = ${warehouseId}
        AND m."supplyId" = ANY(${supplyIds})
        AND (p."confirmedAt" IS NULL OR m."createdAt" > p."confirmedAt")
      GROUP BY m."supplyId", m."type"`;
    const sumOf = (supplyId: string, ...types: string[]) =>
      sums
        .filter((row) => row.supplyId === supplyId && types.includes(row.type))
        .reduce((total, row) => total.plus(row.total), ZERO);

    // Una sola hora para la confirmación y sus movimientos: es el inicio
    // del período del siguiente conteo de estos insumos.
    const confirmedAt = new Date();
    const results = lines.map((line) => {
      const { supplyId } = line;
      const system = levelBySupply.get(supplyId) ?? ZERO;
      const prior = previousBySupply.get(supplyId);
      return {
        line,
        system,
        difference: line.countedQuantity.minus(system),
        unitCost: supplyById.get(supplyId)!.unitCost,
        periodStart: prior?.confirmedAt ?? null,
        previousCounted: prior?.countedQuantity ?? null,
        // Ventas en negativo y sus anulaciones en positivo: vendido neto.
        sold: sumOf(supplyId, "SALE", "SALE_VOID").negated(),
        purchased: sumOf(supplyId, "PURCHASE", "PURCHASE_VOID"),
        adjusted: sumOf(supplyId, "INITIAL", "ADJUSTMENT"),
      };
    });

    const changed = results.filter((result) => !result.difference.isZero());
    if (changed.length > 0) {
      await tx.$executeRaw`
        INSERT INTO "stock_levels" ("companyId", "warehouseId", "supplyId", "quantity", "updatedAt")
        SELECT ${companyId}, ${warehouseId}, v."supplyId", v."quantity", ${confirmedAt}
        FROM unnest(
          ${changed.map((result) => result.line.supplyId)}::text[],
          ${changed.map((result) => result.line.countedQuantity.toString())}::text[]::numeric[]
        ) AS v("supplyId", "quantity")
        ON CONFLICT ("warehouseId", "supplyId")
        DO UPDATE SET "quantity" = EXCLUDED."quantity", "updatedAt" = EXCLUDED."updatedAt"`;
      await tx.stockMovement.createMany({
        data: changed.map((result) => ({
          companyId,
          warehouseId,
          supplyId: result.line.supplyId,
          type: "COUNT" as const,
          quantity: result.difference,
          balanceAfter: result.line.countedQuantity,
          reason: null,
          userId: input.userId,
          inventoryCountId: input.countId,
          createdAt: confirmedAt,
        })),
      });
    }

    // Arreglos como text[]: uno con solo null llegaría como integer[].
    await tx.$executeRaw`
      UPDATE "inventory_count_lines" AS l SET
        "systemQuantity" = v."system",
        "difference" = v."difference",
        "unitCost" = v."unitCost",
        "periodStart" = v."periodStart",
        "previousCounted" = v."previousCounted",
        "soldQuantity" = v."sold",
        "purchasedQuantity" = v."purchased",
        "adjustedQuantity" = v."adjusted"
      FROM unnest(
        ${results.map((result) => result.line.id)}::text[],
        ${results.map((result) => result.system.toString())}::text[]::numeric[],
        ${results.map((result) => result.difference.toString())}::text[]::numeric[],
        ${results.map((result) => result.unitCost?.toString() ?? null)}::text[]::numeric[],
        ${results.map((result) => result.periodStart?.toISOString() ?? null)}::text[]::timestamp(3)[],
        ${results.map((result) => result.previousCounted?.toString() ?? null)}::text[]::numeric[],
        ${results.map((result) => result.sold.toString())}::text[]::numeric[],
        ${results.map((result) => result.purchased.toString())}::text[]::numeric[],
        ${results.map((result) => result.adjusted.toString())}::text[]::numeric[]
      ) AS v("id", "system", "difference", "unitCost", "periodStart", "previousCounted",
             "sold", "purchased", "adjusted")
      WHERE l."id" = v."id" AND l."companyId" = ${companyId}`;

    // El consecutivo al final, como en ventas y compras: si algo falla, vuelve.
    const [{ lastInventoryCountNumber: number }] = await tx.$queryRaw<
      { lastInventoryCountNumber: number }[]
    >`
      UPDATE "companies" SET "lastInventoryCountNumber" = "lastInventoryCountNumber" + 1
      WHERE "id" = ${companyId}
      RETURNING "lastInventoryCountNumber"`;
    await tx.inventoryCount.update({
      where: { id: input.countId },
      data: { status: "CONFIRMED", number, confirmedAt, confirmedById: input.userId },
    });
    return { status: "OK", number };
  }, COUNT_TX_OPTIONS);
}

// --- Lectura ------------------------------------------------------------------

// Conteos en curso, el más reciente primero.
export async function listInventoryCountDrafts(companyId: string) {
  return db.inventoryCount.findMany({
    where: { companyId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      warehouse: { select: { name: true, branch: { select: { name: true } } } },
      _count: { select: { lines: true } },
    },
  });
}

export async function findInventoryCount(companyId: string, countId: string) {
  return db.inventoryCount.findFirst({
    where: { id: countId, companyId },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      confirmedAt: true,
      createdBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
      warehouse: {
        select: {
          id: true,
          name: true,
          isActive: true,
          branch: { select: { id: true, name: true } },
        },
      },
      lines: {
        orderBy: { supply: { name: "asc" } },
        select: {
          id: true,
          unit: true,
          countedQuantity: true,
          systemQuantity: true,
          difference: true,
          unitCost: true,
          periodStart: true,
          previousCounted: true,
          soldQuantity: true,
          purchasedQuantity: true,
          adjustedQuantity: true,
          supply: { select: { id: true, name: true, unit: true, isArchived: true } },
        },
      },
    },
  });
}
