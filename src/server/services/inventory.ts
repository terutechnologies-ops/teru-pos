import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { isDateFormat, type DateFormat } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import { recordAuthEvent } from "@/server/data/auth-audit";
import { listActiveBranches } from "@/server/data/branches";
import { findCompanyCurrency, findCompanySettings } from "@/server/data/companies";
import {
  createSupply,
  createWarehouse,
  findSupply,
  listStockMovements,
  listSupplies,
  listWarehouses,
  recordStockMovement,
  renameWarehouse,
  setSupplyArchived,
  setWarehouseActive,
  updateSupply,
  type InventoryWriteStatus,
} from "@/server/data/inventory";
import { SUPPLY_EVENTS } from "@/server/services/auth/config";
import { assertPermission } from "@/server/services/auth/permissions";
import {
  stockMovementSchema,
  supplySchema,
  warehouseNameSchema,
  type MovementKind,
  type StockMovementFormInput,
  type SupplyInput,
} from "@/server/validations/inventory";

// Inventario. Todo con inventory.manage y dentro de la empresa de la
// sesión. Las bodegas no se auditan (como las categorías); los movimientos
// son su propio registro (usuario, fecha y motivo). De los insumos solo se
// audita el cambio de costo.

export type InventoryResult = { ok: true } | { ok: false; error: string };

// --- Bodegas --------------------------------------------------------------

const WAREHOUSE_GONE = "La bodega ya no existe. Actualiza la página.";
const BRANCH_GONE = "La sucursal ya no está disponible. Actualiza la página.";

const WAREHOUSE_WRITE_ERRORS: Record<Exclude<InventoryWriteStatus, "OK">, string> = {
  NOT_FOUND: WAREHOUSE_GONE,
  NAME_TAKEN: "Ya existe una bodega con ese nombre.",
  BRANCH_NOT_FOUND: BRANCH_GONE,
};

function fromWarehouseStatus(status: InventoryWriteStatus): InventoryResult {
  return status === "OK" ? { ok: true } : { ok: false, error: WAREHOUSE_WRITE_ERRORS[status] };
}

function parseWarehouseName(input: unknown) {
  const parsed = warehouseNameSchema.safeParse(input);
  return parsed.success
    ? { ok: true as const, name: parsed.data }
    : { ok: false as const, error: parsed.error.issues[0].message };
}

// Bodegas agrupadas por sucursal (la principal primero) y las sucursales
// donde se pueden crear.
export async function getWarehouses(session: StaffSessionDto) {
  assertPermission(session, "inventory.manage");
  const [warehouses, branches] = await Promise.all([
    listWarehouses(session.company.id),
    listActiveBranches(session.company.id),
  ]);

  const groups = groupByBranch(warehouses, ({ id, name, isMain, isActive, _count }) => ({
    id,
    name,
    isMain,
    isActive,
    stockedSupplies: _count.stockLevels,
    canDeactivate: isActive && !isMain && _count.stockLevels === 0,
  }));
  return { groups, branches };
}

type WarehouseListRow = Awaited<ReturnType<typeof listWarehouses>>[number];

// Conserva el orden de listWarehouses (sucursal principal primero).
function groupByBranch<T>(warehouses: WarehouseListRow[], toRow: (warehouse: WarehouseListRow) => T) {
  const groups = new Map<string, { branch: { id: string; name: string }; warehouses: T[] }>();
  for (const warehouse of warehouses) {
    const { branch } = warehouse;
    const group = groups.get(branch.id) ?? { branch: { id: branch.id, name: branch.name }, warehouses: [] };
    group.warehouses.push(toRow(warehouse));
    groups.set(branch.id, group);
  }
  return [...groups.values()];
}

export type WarehouseOverview = Awaited<ReturnType<typeof getWarehouses>>;

export async function createInventoryWarehouse(
  session: StaffSessionDto,
  input: { branchId: string; name: unknown },
): Promise<InventoryResult> {
  assertPermission(session, "inventory.manage");
  const parsed = parseWarehouseName(input.name);
  if (!parsed.ok) return parsed;
  // Solo en sucursales activas; la FK compuesta ya impide una ajena.
  const branches = await listActiveBranches(session.company.id);
  if (!branches.some((branch) => branch.id === input.branchId)) {
    return { ok: false, error: BRANCH_GONE };
  }
  return fromWarehouseStatus(
    await createWarehouse(session.company.id, input.branchId, parsed.name),
  );
}

export async function renameInventoryWarehouse(
  session: StaffSessionDto,
  warehouseId: string,
  name: unknown,
): Promise<InventoryResult> {
  assertPermission(session, "inventory.manage");
  const parsed = parseWarehouseName(name);
  if (!parsed.ok) return parsed;
  return fromWarehouseStatus(
    await renameWarehouse(session.company.id, warehouseId, parsed.name),
  );
}

const ACTIVE_ERRORS = {
  NOT_FOUND: WAREHOUSE_GONE,
  IS_MAIN: "La bodega principal de una sucursal no se puede desactivar.",
  HAS_STOCK: "Esta bodega tiene existencias: ajústalas a cero antes de desactivarla.",
} as const;

export async function setInventoryWarehouseActive(
  session: StaffSessionDto,
  warehouseId: string,
  isActive: boolean,
): Promise<InventoryResult> {
  assertPermission(session, "inventory.manage");
  const status = await setWarehouseActive(session.company.id, warehouseId, isActive);
  return status === "OK" ? { ok: true } : { ok: false, error: ACTIVE_ERRORS[status] };
}

// --- Insumos --------------------------------------------------------------

type SupplyRow = NonNullable<Awaited<ReturnType<typeof findSupply>>>;

// Cantidades como texto (Decimal serializado): la vista las formatea con
// la unidad. total suma todas las bodegas.
function toSupplyDto(supply: Omit<SupplyRow, "_count">) {
  const total = supply.stockLevels.reduce(
    (sum, level) => sum.plus(level.quantity),
    new Prisma.Decimal(0),
  );
  return {
    id: supply.id,
    name: supply.name,
    unit: supply.unit,
    isArchived: supply.isArchived,
    minStock: supply.minStock?.toString() ?? null,
    // Costo de referencia por unidad, en la moneda de la empresa.
    unitCost: supply.unitCost?.toString() ?? null,
    totalStock: total.toString(),
    belowMinimum: supply.minStock !== null && total.lessThan(supply.minStock),
  };
}

export type SupplyDto = ReturnType<typeof toSupplyDto>;

export async function getSupplyList(
  session: StaffSessionDto,
  filters: { search?: string; archived?: boolean },
) {
  assertPermission(session, "inventory.manage");
  const [currency, supplies] = await Promise.all([
    findCompanyCurrency(session.company.id),
    listSupplies(session.company.id, {
      search: filters.search?.trim() || undefined,
      archived: filters.archived,
    }),
  ]);
  return { currency, supplies: supplies.map(toSupplyDto) };
}

// unitLocked: ya tiene movimientos, la unidad no se puede cambiar.
export async function getSupply(session: StaffSessionDto, supplyId: string) {
  assertPermission(session, "inventory.manage");
  const [currency, supply] = await Promise.all([
    findCompanyCurrency(session.company.id),
    findSupply(session.company.id, supplyId),
  ]);
  if (!supply) return null;
  return { ...toSupplyDto(supply), unitLocked: supply._count.stockMovements > 0, currency };
}

// El formulario del insumo necesita la moneda (etiqueta y vista previa del
// costo) también al crear.
export async function getInventoryCurrency(session: StaffSessionDto) {
  assertPermission(session, "inventory.manage");
  return findCompanyCurrency(session.company.id);
}

function auditSupplyCost(session: StaffSessionDto, supplyId: string, ctx: RequestContext) {
  return recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action: SUPPLY_EVENTS.COST_CHANGED,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    target: { type: "SUPPLY", id: supplyId },
  });
}

export type SupplyField = keyof SupplyInput;

export type SaveSupplyResult =
  | { ok: true; supplyId: string }
  | { ok: false; fieldErrors: Partial<Record<SupplyField, string>>; error?: string };

const SUPPLY_GONE = "El insumo ya no existe. Actualiza la página.";
const SUPPLY_NAME_TAKEN: SaveSupplyResult = {
  ok: false,
  fieldErrors: { name: "Ya existe un insumo con ese nombre." },
};

function parseSupply(input: SupplyInput) {
  const parsed = supplySchema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    ok: false as const,
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
    ) as Partial<Record<SupplyField, string>>,
  };
}

// Crear con costo cuenta como su primer cambio de costo.
export async function createInventorySupply(
  session: StaffSessionDto,
  input: SupplyInput,
  ctx: RequestContext,
): Promise<SaveSupplyResult> {
  assertPermission(session, "inventory.manage");
  const parsed = parseSupply(input);
  if (!parsed.ok) return parsed;
  const { status, id } = await createSupply(session.company.id, parsed.data);
  if (status === "NAME_TAKEN") return SUPPLY_NAME_TAKEN;
  if (status !== "OK" || !id) throw new Error(`createSupply: ${status}`);
  if (parsed.data.unitCost !== null) await auditSupplyCost(session, id, ctx);
  return { ok: true, supplyId: id };
}

export async function updateInventorySupply(
  session: StaffSessionDto,
  supplyId: string,
  input: SupplyInput,
  ctx: RequestContext,
): Promise<SaveSupplyResult> {
  assertPermission(session, "inventory.manage");
  const parsed = parseSupply(input);
  if (!parsed.ok) return parsed;
  const current = await findSupply(session.company.id, supplyId);
  if (!current) return { ok: false, fieldErrors: {}, error: SUPPLY_GONE };
  const costChanged = !sameDecimal(current.unitCost, parsed.data.unitCost);

  const status = await updateSupply(session.company.id, supplyId, parsed.data);
  switch (status) {
    case "OK":
      if (costChanged) await auditSupplyCost(session, supplyId, ctx);
      return { ok: true, supplyId };
    case "NAME_TAKEN":
      return SUPPLY_NAME_TAKEN;
    case "UNIT_LOCKED":
      return {
        ok: false,
        fieldErrors: {
          unit: "La unidad no se puede cambiar: el insumo ya tiene movimientos.",
        },
      };
    case "UNIT_IN_RECIPES":
      return {
        ok: false,
        fieldErrors: {
          unit: "El insumo se usa en recetas: solo puedes cambiarla por otra del mismo tipo (por ejemplo, de kg a g).",
        },
      };
    default:
      return { ok: false, fieldErrors: {}, error: SUPPLY_GONE };
  }
}

function sameDecimal(current: Prisma.Decimal | null, next: string | null) {
  if (current === null || next === null) return current === next;
  return current.equals(next);
}

export async function setInventorySupplyArchived(
  session: StaffSessionDto,
  supplyId: string,
  isArchived: boolean,
): Promise<InventoryResult> {
  assertPermission(session, "inventory.manage");
  const status = await setSupplyArchived(session.company.id, supplyId, isArchived);
  if (status === "OK") return { ok: true };
  return {
    ok: false,
    error:
      status === "HAS_STOCK"
        ? "Este insumo tiene existencias: ajústalas a cero antes de archivarlo."
        : SUPPLY_GONE,
  };
}

// --- Existencias y movimientos --------------------------------------------

// Movimientos que muestra el kardex (los más recientes).
export const KARDEX_LIMIT = 100;

// Ficha del insumo: existencias por bodega activa (agrupadas por sucursal),
// kardex y las bodegas por las que se puede filtrar.
export async function getSupplyDetail(
  session: StaffSessionDto,
  supplyId: string,
  filters: { warehouseId?: string } = {},
) {
  assertPermission(session, "inventory.manage");
  const companyId = session.company.id;
  const supply = await findSupply(companyId, supplyId);
  if (!supply) return null;

  const [warehouses, movements, company] = await Promise.all([
    listWarehouses(companyId),
    listStockMovements(companyId, supplyId, {
      warehouseId: filters.warehouseId || undefined,
      take: KARDEX_LIMIT,
    }),
    findCompanySettings(companyId),
  ]);

  // El saldo de una bodega nace con su primer movimiento: sin saldo, lo
  // que corresponde es la carga inicial.
  const levels = new Map(supply.stockLevels.map((level) => [level.warehouseId, level.quantity]));
  const stock = groupByBranch(
    warehouses.filter((warehouse) => warehouse.isActive),
    (warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      isMain: warehouse.isMain,
      quantity: levels.get(warehouse.id)?.toString() ?? "0",
      initialized: levels.has(warehouse.id),
    }),
  );

  const dateFormat: DateFormat =
    company && isDateFormat(company.dateFormat) ? company.dateFormat : "DD/MM/YYYY";

  return {
    supply: { ...toSupplyDto(supply), unitLocked: supply._count.stockMovements > 0 },
    stock,
    warehouseOptions: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      branchName: warehouse.branch.name,
      isActive: warehouse.isActive,
    })),
    movements: movements.map((movement) => ({
      id: movement.id,
      kind: movementKind(movement.type, movement.quantity),
      // Sin signo: el tipo dice si entró o salió.
      quantity: movement.quantity.abs().toString(),
      balanceAfter: movement.balanceAfter.toString(),
      reason: movement.reason,
      createdAt: movement.createdAt,
      warehouseName: movement.warehouse.name,
      userName: movement.user.name,
    })),
    dateFormat,
    currency: company?.currency ?? "COP",
  };
}

export type SupplyDetail = NonNullable<Awaited<ReturnType<typeof getSupplyDetail>>>;

function movementKind(type: "INITIAL" | "ADJUSTMENT", quantity: Prisma.Decimal): MovementKind {
  if (type === "INITIAL") return "INITIAL";
  return quantity.isNegative() ? "OUT" : "IN";
}

export type StockMovementField = keyof StockMovementFormInput;

export type RegisterMovementResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<StockMovementField, string>>; error?: string };

const MOVEMENT_ERRORS = {
  SUPPLY_NOT_FOUND: SUPPLY_GONE,
  SUPPLY_ARCHIVED: "El insumo está archivado: restáuralo para registrar movimientos.",
  WAREHOUSE_NOT_FOUND: WAREHOUSE_GONE,
  WAREHOUSE_INACTIVE: "La bodega está inactiva: actívala para registrar movimientos.",
  ALREADY_INITIALIZED:
    "Esta bodega ya tiene su carga inicial. Actualiza la página para registrar un ajuste.",
} as const;

// Carga inicial o ajuste de un insumo en una bodega, a nombre de quien
// tiene la sesión. La salida se registra con cantidad negativa.
export async function registerStockMovement(
  session: StaffSessionDto,
  target: { supplyId: string; warehouseId: string },
  input: StockMovementFormInput,
): Promise<RegisterMovementResult> {
  assertPermission(session, "inventory.manage");
  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
      ) as Partial<Record<StockMovementField, string>>,
    };
  }

  const { kind, quantity, reason } = parsed.data;
  const result = await recordStockMovement(session.company.id, {
    ...target,
    type: kind === "INITIAL" ? "INITIAL" : "ADJUSTMENT",
    quantity: kind === "OUT" ? `-${quantity}` : quantity,
    reason,
    userId: session.user.id,
  });

  switch (result.status) {
    case "OK":
      return { ok: true };
    case "INSUFFICIENT_STOCK":
      return {
        ok: false,
        fieldErrors: {
          quantity: `La salida supera la existencia de la bodega (hay ${formatQuantity(
            result.available.toString(),
            result.unit,
          )}).`,
        },
      };
    default:
      return { ok: false, fieldErrors: {}, error: MOVEMENT_ERRORS[result.status] };
  }
}
