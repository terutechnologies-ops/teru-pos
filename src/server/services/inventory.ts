import "server-only";

import type { StaffSessionDto } from "@/server/dto/auth";
import { listActiveBranches } from "@/server/data/branches";
import {
  createWarehouse,
  listWarehouses,
  renameWarehouse,
  setWarehouseActive,
  type InventoryWriteStatus,
} from "@/server/data/inventory";
import { assertPermission } from "@/server/services/auth/permissions";
import { warehouseNameSchema } from "@/server/validations/inventory";

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
