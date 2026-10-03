import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SupplierData } from "@/server/validations/third-parties";

// Terceros. Por ahora solo proveedores (isSupplier); no se borran: se
// archivan. Nombre y NIT únicos por empresa (índices de la migración).

export type ThirdPartyWriteStatus = "OK" | "NOT_FOUND" | "NAME_TAKEN" | "TAX_ID_TAKEN";

// P2002 en el índice del NIT o en el del nombre.
function uniqueStatus(error: unknown): ThirdPartyWriteStatus | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  return JSON.stringify(error.meta ?? {}).includes("taxId") ? "TAX_ID_TAKEN" : "NAME_TAKEN";
}

const supplierSelect = {
  id: true,
  name: true,
  taxId: true,
  phone: true,
  email: true,
  isArchived: true,
} satisfies Prisma.ThirdPartySelect;

export async function listSuppliers(
  companyId: string,
  filters: { search?: string; archived?: boolean } = {},
) {
  const search = filters.search;
  return db.thirdParty.findMany({
    where: {
      companyId,
      isSupplier: true,
      isArchived: filters.archived ?? false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { taxId: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    },
    orderBy: { name: "asc" },
    select: supplierSelect,
  });
}

export async function findSupplier(companyId: string, supplierId: string) {
  return db.thirdParty.findFirst({
    where: { id: supplierId, companyId, isSupplier: true },
    select: supplierSelect,
  });
}

export async function createSupplier(
  companyId: string,
  data: SupplierData,
): Promise<{ status: ThirdPartyWriteStatus; id?: string }> {
  try {
    const supplier = await db.thirdParty.create({
      data: { companyId, ...data, isSupplier: true },
      select: { id: true },
    });
    return { status: "OK", id: supplier.id };
  } catch (error) {
    const status = uniqueStatus(error);
    if (status) return { status };
    throw error;
  }
}

export async function updateSupplier(
  companyId: string,
  supplierId: string,
  data: SupplierData,
): Promise<ThirdPartyWriteStatus> {
  try {
    const { count } = await db.thirdParty.updateMany({
      where: { id: supplierId, companyId, isSupplier: true },
      data,
    });
    return count === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    const status = uniqueStatus(error);
    if (status) return status;
    throw error;
  }
}

// Se puede archivar aunque tenga compras: las anteriores quedan igual y ya
// no se elige en compras nuevas.
export async function setSupplierArchived(
  companyId: string,
  supplierId: string,
  isArchived: boolean,
): Promise<"OK" | "NOT_FOUND"> {
  const { count } = await db.thirdParty.updateMany({
    where: { id: supplierId, companyId, isSupplier: true },
    data: { isArchived },
  });
  return count === 1 ? "OK" : "NOT_FOUND";
}
