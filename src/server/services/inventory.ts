import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { StaffSessionDto } from "@/server/dto/auth";
import { listActiveBranches } from "@/server/data/branches";
import {
  createSupply,
  createWarehouse,
  findSupply,
  listSupplies,
  listWarehouses,
  renameWarehouse,
  setSupplyArchived,
  setWarehouseActive,
  updateSupply,
  type InventoryWriteStatus,
} from "@/server/data/inventory";
import { assertPermission } from "@/server/services/auth/permissions";
import {
  supplySchema,
  warehouseNameSchema,
  type SupplyInput,
} from "@/server/validations/inventory";

// Inventario. Todo con inventory.manage y dentro de la empresa de la
// sesión. Las bodegas no se auditan (como las categorías); los movimientos
// son su propio registro (usuario, fecha y motivo).

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

  const groups = new Map<string, { branch: { id: string; name: string }; warehouses: WarehouseRow[] }>();
  for (const { _count, branch, ...warehouse } of warehouses) {
    const group = groups.get(branch.id) ?? { branch: { id: branch.id, name: branch.name }, warehouses: [] };
    group.warehouses.push({
      ...warehouse,
      stockedSupplies: _count.stockLevels,
      canDeactivate: warehouse.isActive && !warehouse.isMain && _count.stockLevels === 0,
    });
    groups.set(branch.id, group);
  }
  return { groups: [...groups.values()], branches };
}

type WarehouseRow = {
  id: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
  stockedSupplies: number;
  canDeactivate: boolean;
};

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
  const supplies = await listSupplies(session.company.id, {
    search: filters.search?.trim() || undefined,
    archived: filters.archived,
  });
  return supplies.map(toSupplyDto);
}

// unitLocked: ya tiene movimientos, la unidad no se puede cambiar.
export async function getSupply(session: StaffSessionDto, supplyId: string) {
  assertPermission(session, "inventory.manage");
  const supply = await findSupply(session.company.id, supplyId);
  if (!supply) return null;
  return { ...toSupplyDto(supply), unitLocked: supply._count.stockMovements > 0 };
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

export async function createInventorySupply(
  session: StaffSessionDto,
  input: SupplyInput,
): Promise<SaveSupplyResult> {
  assertPermission(session, "inventory.manage");
  const parsed = parseSupply(input);
  if (!parsed.ok) return parsed;
  const { status, id } = await createSupply(session.company.id, parsed.data);
  if (status === "NAME_TAKEN") return SUPPLY_NAME_TAKEN;
  if (status !== "OK" || !id) throw new Error(`createSupply: ${status}`);
  return { ok: true, supplyId: id };
}

export async function updateInventorySupply(
  session: StaffSessionDto,
  supplyId: string,
  input: SupplyInput,
): Promise<SaveSupplyResult> {
  assertPermission(session, "inventory.manage");
  const parsed = parseSupply(input);
  if (!parsed.ok) return parsed;
  const status = await updateSupply(session.company.id, supplyId, parsed.data);
  switch (status) {
    case "OK":
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
    default:
      return { ok: false, fieldErrors: {}, error: SUPPLY_GONE };
  }
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
