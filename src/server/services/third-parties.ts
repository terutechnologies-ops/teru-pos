import "server-only";

import { z } from "zod";

import type { StaffSessionDto } from "@/server/dto/auth";
import {
  createSupplier,
  findSupplier,
  listSuppliers,
  setSupplierArchived,
  updateSupplier,
} from "@/server/data/third-parties";
import { assertPermission } from "@/server/services/auth/permissions";
import { supplierSchema, type SupplierInput } from "@/server/validations/third-parties";

// Terceros. Por ahora solo proveedores, con purchases.manage y dentro de la
// empresa de la sesión. Sin auditoría (como las bodegas): no mueven dinero
// ni existencias.

export type SupplierDto = Awaited<ReturnType<typeof listSuppliers>>[number];

export async function getSupplierList(
  session: StaffSessionDto,
  filters: { search?: string; archived?: boolean },
): Promise<SupplierDto[]> {
  assertPermission(session, "purchases.manage");
  return listSuppliers(session.company.id, {
    search: filters.search?.trim() || undefined,
    archived: filters.archived,
  });
}

export async function getSupplier(
  session: StaffSessionDto,
  supplierId: string,
): Promise<SupplierDto | null> {
  assertPermission(session, "purchases.manage");
  return findSupplier(session.company.id, supplierId);
}

export type SupplierField = keyof SupplierInput;

export type SaveSupplierResult =
  | { ok: true; supplierId: string }
  | { ok: false; fieldErrors: Partial<Record<SupplierField, string>>; error?: string };

export type SupplierResult = { ok: true } | { ok: false; error: string };

const SUPPLIER_GONE = "El proveedor ya no existe. Actualiza la página.";

const TAKEN: Record<"NAME_TAKEN" | "TAX_ID_TAKEN", SaveSupplierResult> = {
  NAME_TAKEN: {
    ok: false,
    fieldErrors: { name: "Ya existe un proveedor con ese nombre." },
  },
  TAX_ID_TAKEN: {
    ok: false,
    fieldErrors: { taxId: "Ya existe un proveedor con ese NIT." },
  },
};

function parseSupplier(input: SupplierInput) {
  const parsed = supplierSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    ok: false as const,
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([field, errors]) => [field, errors?.[0]]),
    ) as Partial<Record<SupplierField, string>>,
  };
}

export async function createThirdPartySupplier(
  session: StaffSessionDto,
  input: SupplierInput,
): Promise<SaveSupplierResult> {
  assertPermission(session, "purchases.manage");
  const parsed = parseSupplier(input);
  if (!parsed.ok) return parsed;
  const { status, id } = await createSupplier(session.company.id, parsed.data);
  if (status === "NAME_TAKEN" || status === "TAX_ID_TAKEN") return TAKEN[status];
  if (status !== "OK" || !id) throw new Error(`createSupplier: ${status}`);
  return { ok: true, supplierId: id };
}

export async function updateThirdPartySupplier(
  session: StaffSessionDto,
  supplierId: string,
  input: SupplierInput,
): Promise<SaveSupplierResult> {
  assertPermission(session, "purchases.manage");
  const parsed = parseSupplier(input);
  if (!parsed.ok) return parsed;
  const status = await updateSupplier(session.company.id, supplierId, parsed.data);
  if (status === "OK") return { ok: true, supplierId };
  if (status === "NOT_FOUND") return { ok: false, fieldErrors: {}, error: SUPPLIER_GONE };
  return TAKEN[status];
}

export async function setThirdPartySupplierArchived(
  session: StaffSessionDto,
  supplierId: string,
  isArchived: boolean,
): Promise<SupplierResult> {
  assertPermission(session, "purchases.manage");
  const status = await setSupplierArchived(session.company.id, supplierId, isArchived);
  return status === "OK" ? { ok: true } : { ok: false, error: SUPPLIER_GONE };
}
