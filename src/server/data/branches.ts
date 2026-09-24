import "server-only";

import { db } from "@/lib/db";

export async function findMainBranch(companyId: string) {
  return db.branch.findFirst({
    where: { companyId, isMain: true },
    select: { id: true, name: true, address: true, isActive: true },
  });
}
