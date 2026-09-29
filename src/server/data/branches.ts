import "server-only";

import { db } from "@/lib/db";

export async function findMainBranch(companyId: string) {
  return db.branch.findFirst({
    where: { companyId, isMain: true },
    select: { id: true, name: true, address: true, isActive: true },
  });
}

// La principal primero.
export async function listActiveBranches(companyId: string) {
  return db.branch.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isMain: true },
  });
}
