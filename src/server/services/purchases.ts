import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import {
  calendarDay,
  formatDate,
  formatDateTime,
} from "@/lib/company-formats";
import { convertQuantity, familyUnits, UNIT_INFO } from "@/lib/units";
import type { StaffSessionDto } from "@/server/dto/auth";
import { findCompanyFormats } from "@/server/data/companies";
import { findMainWarehouseId, findSupply, listSupplies, listWarehouses } from "@/server/data/inventory";
import {
  addPurchaseLine,
  confirmPurchase,
  createPurchaseDraft,
  deletePurchaseDraft,
  findPurchase,
  findPurchaseLineSupplyUnit,
  listPurchaseDrafts,
  removePurchaseLine,
  updatePurchaseDraft,
  updatePurchaseLine,
  type LineWriteStatus,
  type PurchaseHeader,
} from "@/server/data/purchases";
import { listSuppliers } from "@/server/data/third-parties";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import {
  purchaseHeaderSchema,
  purchaseItemSchema,
  purchaseLineSchema,
  type PurchaseHeaderFormInput,
  type PurchaseItemFormInput,
  type PurchaseLineFormInput,
} from "@/server/validations/purchases";

// Compras de insumos (ver ADR 0008). Todo con purchases.manage y dentro de
// la empresa de la sesión. Los borradores son de la empresa, no de quien
// los creó. Sin auditoría aparte: la compra guarda quién la creó y la
// confirmó, y sus movimientos del kardex la enlazan (también el cambio de
// costo que produce).

const PURCHASE_GONE = "La compra ya no existe. Actualiza la página.";
const NOT_DRAFT = "La compra ya fue confirmada y no se puede cambiar. Actualiza la página.";
const LINE_GONE = "La línea ya no existe. Actualiza la página.";

function firstErrors<F extends string>(error: z.ZodError) {
  const { fieldErrors } = z.flattenError(error);
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, errors]) => [field, (errors as string[])?.[0]]),
  ) as Partial<Record<F, string>>;
}

// --- Opciones del encabezado ---------------------------------------------------

export type PurchaseFormOptions = Awaited<ReturnType<typeof loadFormOptions>>;

// Proveedores activos, bodegas activas (la principal propuesta) y el día de
// hoy en la zona de la empresa. `current` incluye el proveedor del borrador
// aunque esté archivado, para que el formulario lo muestre.
async function loadFormOptions(
  companyId: string,
  timeZone: string,
  current?: { id: string; name: string; isArchived: boolean },
) {
  const [suppliers, warehouses, mainWarehouseId] = await Promise.all([
    listSuppliers(companyId),
    listWarehouses(companyId),
    findMainWarehouseId(companyId),
  ]);
  const active = warehouses.filter((warehouse) => warehouse.isActive);
  const supplierOptions = suppliers.map(({ id, name }) => ({ id, name, isArchived: false }));
  if (current?.isArchived) supplierOptions.unshift({ ...current });
  return {
    suppliers: supplierOptions,
    warehouses: active.map(({ id, name, branch }) => ({ id, name, branchName: branch.name })),
    showBranch: new Set(active.map((warehouse) => warehouse.branch.id)).size > 1,
    defaultWarehouseId:
      active.find((warehouse) => warehouse.id === mainWarehouseId)?.id ?? active[0]?.id ?? "",
    today: calendarDay(new Date(), timeZone),
  };
}

export async function getPurchaseFormOptions(session: StaffSessionDto) {
  assertPermission(session, "purchases.manage");
  const { timeZone } = await findCompanyFormats(session.company.id);
  return loadFormOptions(session.company.id, timeZone);
}

// --- Borradores -------------------------------------------------------------------

export async function getPurchaseDrafts(session: StaffSessionDto) {
  assertPermission(session, "purchases.manage");
  const [formats, drafts] = await Promise.all([
    findCompanyFormats(session.company.id),
    listPurchaseDrafts(session.company.id),
  ]);
  return {
    currency: formats.currency,
    drafts: drafts.map((draft) => ({
      id: draft.id,
      supplierName: draft.supplier.name,
      warehouseName: draft.warehouse.name,
      supplierInvoice: draft.supplierInvoice,
      purchasedOn: formatDate(draft.purchasedOn, formats.dateFormat),
      total: draft.total.toString(),
      lineCount: draft._count.lines,
      createdBy: draft.createdBy.name,
      createdAt: formatDateTime(draft.createdAt, formats.dateFormat, formats.timeZone),
    })),
  };
}

export type PurchaseDraftRow = Awaited<ReturnType<typeof getPurchaseDrafts>>["drafts"][number];

// --- Una compra ---------------------------------------------------------------------

// Costo por unidad del insumo que resulta de la línea (4 decimales, como
// supplies.unitCost).
function lineUnitCost(line: { quantity: Prisma.Decimal; unit: StockUnit; lineTotal: Prisma.Decimal }, supplyUnit: StockUnit) {
  const quantity = new Prisma.Decimal(convertQuantity(line.quantity.toString(), line.unit, supplyUnit));
  return line.lineTotal.dividedBy(quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toString();
}

// Encabezado, líneas con su costo unitario y, si es borrador, lo necesario
// para editarlo. null si no es de la empresa.
export async function getPurchase(session: StaffSessionDto, purchaseId: string) {
  assertPermission(session, "purchases.manage");
  const companyId = session.company.id;
  const [formats, purchase] = await Promise.all([
    findCompanyFormats(companyId),
    findPurchase(companyId, purchaseId),
  ]);
  if (!purchase) return null;
  const isDraft = purchase.status === "DRAFT";

  const lines = purchase.lines.map((line) => ({
    id: line.id,
    quantity: line.quantity.toString(),
    unit: line.unit,
    lineTotal: line.lineTotal.toString(),
    unitCost: lineUnitCost(line, line.supply.unit),
    supply: {
      id: line.supply.id,
      name: line.supply.name,
      unit: line.supply.unit,
      isArchived: line.supply.isArchived,
      uninitialized: line.supply._count.stockMovements === 0,
    },
  }));

  let draft = null;
  if (isDraft) {
    const [options, supplies] = await Promise.all([
      loadFormOptions(companyId, formats.timeZone, purchase.supplier),
      listSupplies(companyId),
    ]);
    const used = new Set(lines.map((line) => line.supply.id));
    draft = {
      options,
      hasSupplies: supplies.length > 0,
      availableSupplies: supplies
        .filter((supply) => !used.has(supply.id))
        .map(({ id, name, unit }) => ({ id, name, unit })),
    };
  }

  return {
    id: purchase.id,
    number: purchase.number,
    status: purchase.status,
    currency: formats.currency,
    supplier: purchase.supplier,
    warehouse: {
      id: purchase.warehouse.id,
      name: purchase.warehouse.name,
      isActive: purchase.warehouse.isActive,
      branchName: purchase.warehouse.branch.name,
    },
    supplierInvoice: purchase.supplierInvoice,
    // AAAA-MM-DD (valor del campo) y como se muestra.
    purchasedOnDay: purchase.purchasedOn.toISOString().slice(0, 10),
    purchasedOn: formatDate(purchase.purchasedOn, formats.dateFormat),
    total: purchase.total.toString(),
    createdBy: purchase.createdBy.name,
    createdAt: formatDateTime(purchase.createdAt, formats.dateFormat, formats.timeZone),
    confirmedBy: purchase.confirmedBy?.name ?? null,
    confirmedAt: purchase.confirmedAt
      ? formatDateTime(purchase.confirmedAt, formats.dateFormat, formats.timeZone)
      : null,
    lines,
    canViewSupplies: hasPermission(session.user.role, "inventory.manage"),
    draft,
  };
}

export type PurchaseDetail = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;

// --- Encabezado -----------------------------------------------------------------------

export type PurchaseHeaderField = keyof PurchaseHeaderFormInput;

export type SavePurchaseHeaderResult =
  | { ok: true; purchaseId: string }
  | { ok: false; fieldErrors: Partial<Record<PurchaseHeaderField, string>>; error?: string };

const HEADER_ERRORS = {
  SUPPLIER_NOT_FOUND: {
    ok: false,
    fieldErrors: { supplierId: "El proveedor está archivado o ya no existe. Elige otro." },
  },
  WAREHOUSE_NOT_FOUND: {
    ok: false,
    fieldErrors: { warehouseId: "La bodega está inactiva o ya no existe. Elige otra." },
  },
} as const satisfies Record<string, SavePurchaseHeaderResult>;

async function parseHeader(companyId: string, input: PurchaseHeaderFormInput) {
  const { timeZone } = await findCompanyFormats(companyId);
  const parsed = purchaseHeaderSchema(calendarDay(new Date(), timeZone)).safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, fieldErrors: firstErrors<PurchaseHeaderField>(parsed.error) };
  }
  const { purchasedOn, ...rest } = parsed.data;
  const header: PurchaseHeader = { ...rest, purchasedOn: new Date(`${purchasedOn}T00:00:00Z`) };
  return { ok: true as const, header };
}

export async function createPurchase(
  session: StaffSessionDto,
  input: PurchaseHeaderFormInput,
): Promise<SavePurchaseHeaderResult> {
  assertPermission(session, "purchases.manage");
  const parsed = await parseHeader(session.company.id, input);
  if (!parsed.ok) return parsed;
  const result = await createPurchaseDraft(session.company.id, {
    ...parsed.header,
    userId: session.user.id,
  });
  if (result.status !== "OK") return HEADER_ERRORS[result.status];
  return { ok: true, purchaseId: result.purchaseId };
}

export async function updatePurchaseHeader(
  session: StaffSessionDto,
  purchaseId: string,
  input: PurchaseHeaderFormInput,
): Promise<SavePurchaseHeaderResult> {
  assertPermission(session, "purchases.manage");
  const parsed = await parseHeader(session.company.id, input);
  if (!parsed.ok) return parsed;
  const { status } = await updatePurchaseDraft(session.company.id, purchaseId, parsed.header);
  switch (status) {
    case "OK":
      return { ok: true, purchaseId };
    case "SUPPLIER_NOT_FOUND":
    case "WAREHOUSE_NOT_FOUND":
      return HEADER_ERRORS[status];
    case "NOT_DRAFT":
      return { ok: false, fieldErrors: {}, error: NOT_DRAFT };
    default:
      return { ok: false, fieldErrors: {}, error: PURCHASE_GONE };
  }
}

export type PurchaseResult = { ok: true } | { ok: false; error: string };

export async function deletePurchase(
  session: StaffSessionDto,
  purchaseId: string,
): Promise<PurchaseResult> {
  assertPermission(session, "purchases.manage");
  const { status } = await deletePurchaseDraft(session.company.id, purchaseId);
  if (status === "OK") return { ok: true };
  return { ok: false, error: status === "NOT_DRAFT" ? NOT_DRAFT : PURCHASE_GONE };
}

// --- Líneas ------------------------------------------------------------------------------

export type PurchaseItemField = keyof PurchaseItemFormInput;

export type SavePurchaseLineResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<PurchaseItemField, string>>; error?: string };

function fail(error: string): SavePurchaseLineResult {
  return { ok: false, fieldErrors: {}, error };
}

function fieldError(field: PurchaseItemField, message: string): SavePurchaseLineResult {
  return { ok: false, fieldErrors: { [field]: message } };
}

function unitMismatch(unit: StockUnit | null | undefined) {
  if (!unit) return fail(LINE_GONE);
  const options = familyUnits(unit).map((option) => UNIT_INFO[option].symbol);
  return fieldError(
    "unit",
    `El insumo se mide en ${UNIT_INFO[unit].symbol}: usa ${options.join(" o ")}.`,
  );
}

async function lineError(
  companyId: string,
  status: Exclude<LineWriteStatus, "OK">,
  supplyUnit: () => Promise<StockUnit | null | undefined>,
) {
  switch (status) {
    case "NOT_DRAFT":
      return fail(NOT_DRAFT);
    case "SUPPLY_NOT_FOUND":
      return fieldError("supplyId", "El insumo ya no existe. Elige otro.");
    case "SUPPLY_ARCHIVED":
      return fieldError("supplyId", "El insumo está archivado: restáuralo para comprarlo.");
    case "ALREADY_IN_PURCHASE":
      return fieldError("supplyId", "Este insumo ya está en la compra: cambia su línea.");
    case "UNIT_MISMATCH":
      return unitMismatch(await supplyUnit());
    default:
      return fail(PURCHASE_GONE);
  }
}

export async function addPurchaseItem(
  session: StaffSessionDto,
  purchaseId: string,
  input: PurchaseItemFormInput,
): Promise<SavePurchaseLineResult> {
  assertPermission(session, "purchases.manage");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = purchaseItemSchema(currency).safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstErrors<PurchaseItemField>(parsed.error) };
  }
  const { status } = await addPurchaseLine(companyId, purchaseId, parsed.data);
  if (status === "OK") return { ok: true };
  return lineError(companyId, status, async () =>
    (await findSupply(companyId, parsed.data.supplyId))?.unit,
  );
}

export async function updatePurchaseItem(
  session: StaffSessionDto,
  lineId: string,
  input: PurchaseLineFormInput,
): Promise<SavePurchaseLineResult> {
  assertPermission(session, "purchases.manage");
  const companyId = session.company.id;
  const { currency } = await findCompanyFormats(companyId);
  const parsed = purchaseLineSchema(currency).safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstErrors<PurchaseItemField>(parsed.error) };
  }
  const { status } = await updatePurchaseLine(companyId, lineId, parsed.data);
  if (status === "OK") return { ok: true };
  if (status === "NOT_FOUND") return fail(LINE_GONE);
  return lineError(companyId, status, () => findPurchaseLineSupplyUnit(companyId, lineId));
}

export async function removePurchaseItem(
  session: StaffSessionDto,
  lineId: string,
): Promise<PurchaseResult> {
  assertPermission(session, "purchases.manage");
  const { status } = await removePurchaseLine(session.company.id, lineId);
  if (status === "OK") return { ok: true };
  return { ok: false, error: status === "NOT_DRAFT" ? NOT_DRAFT : LINE_GONE };
}

// --- Confirmar -------------------------------------------------------------------------

export type ConfirmPurchaseDraftResult = { ok: true; number: number } | { ok: false; error: string };

export async function confirmPurchaseDraft(
  session: StaffSessionDto,
  purchaseId: string,
): Promise<ConfirmPurchaseDraftResult> {
  assertPermission(session, "purchases.manage");
  const companyId = session.company.id;
  const result = await confirmPurchase(companyId, { purchaseId, userId: session.user.id });
  switch (result.status) {
    case "OK":
      return { ok: true, number: result.number };
    case "EMPTY":
      return { ok: false, error: "Agrega al menos un insumo antes de confirmar." };
    case "WAREHOUSE_INACTIVE":
      return {
        ok: false,
        error: "La bodega de la compra está inactiva: cambia la bodega en el encabezado.",
      };
    case "SUPPLY_ARCHIVED":
    case "UNIT_MISMATCH": {
      const name = (await findSupply(companyId, result.supplyId))?.name ?? "Un insumo";
      return {
        ok: false,
        error:
          result.status === "SUPPLY_ARCHIVED"
            ? `${name} está archivado: quítalo de la compra o restáuralo.`
            : `La unidad de ${name} cambió: corrige su línea.`,
      };
    }
    case "NOT_DRAFT":
      return { ok: false, error: "La compra ya estaba confirmada." };
    default:
      return { ok: false, error: PURCHASE_GONE };
  }
}
