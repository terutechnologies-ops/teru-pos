import "server-only";

import { formatDateTime } from "@/lib/company-formats";
import { isStockUnit, UNIT_INFO } from "@/lib/units";
import type { StaffSessionDto } from "@/server/dto/auth";
import { countOpenCashSessionsInBranch } from "@/server/data/cash-sessions";
import { findCompanyFormats } from "@/server/data/companies";
import {
  confirmInventoryCount,
  createInventoryCountDraft,
  deleteInventoryCountDraft,
  findInventoryCount,
  listInventoryCountDrafts,
  saveInventoryCountLines,
  type CountEntry,
} from "@/server/data/inventory-counts";
import { findSupply, listSupplies, listWarehouses } from "@/server/data/inventory";
import { assertPermission } from "@/server/services/auth/permissions";
import { countedQuantitySchema } from "@/server/validations/inventory-counts";

// Conteo físico por bodega (ver ADR 0009). Todo con inventory.manage y
// dentro de la empresa de la sesión. Los borradores son de la empresa, no
// de quien los empezó. Sin auditoría aparte: el conteo guarda quién lo
// empezó y lo confirmó, y sus movimientos del kardex lo enlazan.

const COUNT_GONE = "El conteo ya no existe. Actualiza la página.";
const NOT_DRAFT = "El conteo ya fue confirmado y no se puede cambiar. Actualiza la página.";
const SUPPLY_GONE = "Uno de los insumos ya no existe. Actualiza la página.";

// --- Empezar ------------------------------------------------------------------

// Bodegas activas donde se puede contar.
export async function getCountStartOptions(session: StaffSessionDto) {
  assertPermission(session, "inventory.manage");
  const warehouses = await listWarehouses(session.company.id);
  const active = warehouses.filter((warehouse) => warehouse.isActive);
  return {
    warehouses: active.map(({ id, name, branch }) => ({ id, name, branchName: branch.name })),
    showBranch: new Set(active.map((warehouse) => warehouse.branch.id)).size > 1,
  };
}

export type StartCountResult = { ok: true; countId: string } | { ok: false; error: string };

// Crea el borrador de la bodega o retoma el que ya tiene (uno por bodega).
export async function startCount(
  session: StaffSessionDto,
  warehouseId: string,
): Promise<StartCountResult> {
  assertPermission(session, "inventory.manage");
  const result = await createInventoryCountDraft(session.company.id, {
    warehouseId,
    userId: session.user.id,
  });
  switch (result.status) {
    case "OK":
    case "DRAFT_EXISTS":
      return { ok: true, countId: result.countId };
    case "WAREHOUSE_NOT_FOUND":
      return { ok: false, error: "Elige una bodega." };
    case "WAREHOUSE_INACTIVE":
      return { ok: false, error: "La bodega está inactiva: actívala en Bodegas para contarla." };
  }
}

// --- Borradores ---------------------------------------------------------------

export async function getCountDrafts(session: StaffSessionDto) {
  assertPermission(session, "inventory.manage");
  const companyId = session.company.id;
  const [formats, drafts, warehouses] = await Promise.all([
    findCompanyFormats(companyId),
    listInventoryCountDrafts(companyId),
    listWarehouses(companyId),
  ]);
  const showBranch = new Set(warehouses.map((warehouse) => warehouse.branch.id)).size > 1;
  return drafts.map((draft) => ({
    id: draft.id,
    warehouseName: showBranch
      ? `${draft.warehouse.branch.name} · ${draft.warehouse.name}`
      : draft.warehouse.name,
    countedCount: draft._count.lines,
    createdBy: draft.createdBy.name,
    createdAt: formatDateTime(draft.createdAt, formats.dateFormat, formats.timeZone),
  }));
}

export type CountDraftRow = Awaited<ReturnType<typeof getCountDrafts>>[number];

// --- Conteo -------------------------------------------------------------------

// Texto decimal con coma, como se escribe en el formulario ("9.25" → "9,25").
function inputValue(value: { toString(): string }) {
  return value.toString().replace(".", ",");
}

// El conteo con lo necesario para su página. En borrador: todos los
// insumos activos por nombre, con el saldo actual de la bodega (null = sin
// carga inicial en ella) y lo contado hasta ahora, más los archivados que
// ya tenían algo contado (para dejarlos en blanco). Confirmado: sus líneas
// tal como quedaron. null = no es de la empresa.
export async function getCount(session: StaffSessionDto, countId: string) {
  assertPermission(session, "inventory.manage");
  const companyId = session.company.id;
  const [count, formats, warehouses] = await Promise.all([
    findInventoryCount(companyId, countId),
    findCompanyFormats(companyId),
    listWarehouses(companyId),
  ]);
  if (!count) return null;

  const showBranch = new Set(warehouses.map((warehouse) => warehouse.branch.id)).size > 1;
  const header = {
    id: count.id,
    number: count.number,
    status: count.status,
    warehouse: {
      id: count.warehouse.id,
      name: count.warehouse.name,
      label: showBranch
        ? `${count.warehouse.branch.name} · ${count.warehouse.name}`
        : count.warehouse.name,
      isActive: count.warehouse.isActive,
    },
    createdBy: count.createdBy.name,
    createdAt: formatDateTime(count.createdAt, formats.dateFormat, formats.timeZone),
    confirmedBy: count.confirmedBy?.name ?? null,
    confirmedAt: count.confirmedAt
      ? formatDateTime(count.confirmedAt, formats.dateFormat, formats.timeZone)
      : null,
  };

  if (count.status === "CONFIRMED") {
    return {
      ...header,
      draft: null,
      lines: count.lines.map((line) => ({
        supplyId: line.supply.id,
        name: line.supply.name,
        unit: line.unit,
        counted: line.countedQuantity.toString(),
        system: line.systemQuantity!.toString(),
        difference: line.difference!.toString(),
      })),
    };
  }

  const [supplies, openShifts] = await Promise.all([
    listSupplies(companyId),
    countOpenCashSessionsInBranch(companyId, count.warehouse.branch.id),
  ]);
  const counted = new Map(count.lines.map((line) => [line.supply.id, line]));
  const row = (supply: { id: string; name: string; unit: (typeof supplies)[number]["unit"] }) => {
    const line = counted.get(supply.id);
    return {
      supplyId: supply.id,
      name: supply.name,
      unit: supply.unit,
      counted: line ? inputValue(line.countedQuantity) : "",
    };
  };
  const rows = [
    ...supplies.map((supply) => {
      const level = supply.stockLevels.find((entry) => entry.warehouseId === count.warehouse.id);
      return { ...row(supply), archived: false, system: level ? level.quantity.toString() : null };
    }),
    // Archivados con algo contado: no se pueden confirmar así.
    ...count.lines
      .filter((line) => line.supply.isArchived)
      .map((line) => ({ ...row(line.supply), archived: true, system: null })),
  ];

  return {
    ...header,
    draft: { rows, openShifts, countedCount: count.lines.length },
    lines: [],
  };
}

export type CountDetail = NonNullable<Awaited<ReturnType<typeof getCount>>>;
export type CountDraftDetail = NonNullable<CountDetail["draft"]>;

// --- Guardar y confirmar -------------------------------------------------------

// Lo que llega del formulario por insumo: lo escrito y la unidad que se
// mostró, todo texto.
export type CountFormEntry = { supplyId: string; counted: string; unit: string };

export type SaveCountResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors: Record<string, string> };

type ValidEntries = { ok: true; entries: CountEntry[] } | Extract<SaveCountResult, { ok: false }>;

function validateEntries(entries: CountFormEntry[]): ValidEntries {
  const fieldErrors: Record<string, string> = {};
  const valid: CountEntry[] = [];
  for (const entry of entries) {
    const parsed = countedQuantitySchema.safeParse(entry.counted);
    if (!isStockUnit(entry.unit)) {
      fieldErrors[entry.supplyId] = SUPPLY_GONE;
    } else if (!parsed.success) {
      fieldErrors[entry.supplyId] = parsed.error.issues[0].message;
    } else {
      valid.push({ supplyId: entry.supplyId, countedQuantity: parsed.data, unit: entry.unit });
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Revisa las cantidades marcadas.", fieldErrors };
  }
  return { ok: true, entries: valid };
}

// Mensaje sobre un insumo en su fila y arriba del formulario.
async function supplyProblem(
  session: StaffSessionDto,
  supplyId: string,
  problem: "SUPPLY_NOT_FOUND" | "SUPPLY_ARCHIVED" | "UNIT_CHANGED",
): Promise<Extract<SaveCountResult, { ok: false }>> {
  const supply = await findSupply(session.company.id, supplyId);
  if (!supply || problem === "SUPPLY_NOT_FOUND") return { ok: false, error: SUPPLY_GONE, fieldErrors: {} };
  if (problem === "SUPPLY_ARCHIVED") {
    return {
      ok: false,
      error: `${supply.name} está archivado: déjalo en blanco o restáuralo para contarlo.`,
      fieldErrors: { [supplyId]: "Archivado: déjalo en blanco." },
    };
  }
  return {
    ok: false,
    error: `La unidad de ${supply.name} cambió a ${UNIT_INFO[supply.unit].symbol}: revisa lo contado.`,
    fieldErrors: { [supplyId]: `Ahora se mide en ${UNIT_INFO[supply.unit].symbol}.` },
  };
}

// Guarda lo escrito (en blanco = no se cuenta). Nada se guarda si alguna
// cantidad no es válida.
export async function saveCount(
  session: StaffSessionDto,
  countId: string,
  entries: CountFormEntry[],
): Promise<SaveCountResult> {
  assertPermission(session, "inventory.manage");
  const valid = validateEntries(entries);
  if (!valid.ok) return valid;
  const result = await saveInventoryCountLines(session.company.id, countId, valid.entries);
  switch (result.status) {
    case "OK":
      return { ok: true };
    case "NOT_FOUND":
      return { ok: false, error: COUNT_GONE, fieldErrors: {} };
    case "NOT_DRAFT":
      return { ok: false, error: NOT_DRAFT, fieldErrors: {} };
    default:
      return supplyProblem(session, result.supplyId, result.status);
  }
}

export type ConfirmCountResult = { ok: true; number: number } | Extract<SaveCountResult, { ok: false }>;

// Guarda lo escrito y confirma: así no se pierde lo que no se había
// guardado. El saldo del sistema se toma en ese momento.
export async function confirmCount(
  session: StaffSessionDto,
  countId: string,
  entries: CountFormEntry[],
): Promise<ConfirmCountResult> {
  const saved = await saveCount(session, countId, entries);
  if (!saved.ok) return saved;
  const result = await confirmInventoryCount(session.company.id, {
    countId,
    userId: session.user.id,
  });
  switch (result.status) {
    case "OK":
      return { ok: true, number: result.number };
    case "NOT_FOUND":
      return { ok: false, error: COUNT_GONE, fieldErrors: {} };
    case "NOT_DRAFT":
      return { ok: false, error: NOT_DRAFT, fieldErrors: {} };
    case "EMPTY":
      return {
        ok: false,
        error: "Escribe lo contado de al menos un insumo para confirmar.",
        fieldErrors: {},
      };
    case "WAREHOUSE_INACTIVE":
      return {
        ok: false,
        error: "La bodega está inactiva: actívala en Bodegas para confirmar el conteo.",
        fieldErrors: {},
      };
    default:
      return supplyProblem(session, result.supplyId, result.status);
  }
}

export type DeleteCountResult = { ok: true } | { ok: false; error: string };

export async function deleteCount(
  session: StaffSessionDto,
  countId: string,
): Promise<DeleteCountResult> {
  assertPermission(session, "inventory.manage");
  const { status } = await deleteInventoryCountDraft(session.company.id, countId);
  if (status === "OK") return { ok: true };
  return { ok: false, error: status === "NOT_FOUND" ? COUNT_GONE : NOT_DRAFT };
}
