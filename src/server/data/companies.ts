import "server-only";

import { db } from "@/lib/db";

export async function findActiveCompanyBySlug(slug: string) {
  return db.company.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, slug: true },
  });
}
