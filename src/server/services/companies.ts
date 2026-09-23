import "server-only";

import { findActiveCompanyBySlug } from "@/server/data/companies";
import { companySlugSchema } from "@/server/validations/auth";

// null si el slug es inválido o la empresa no existe o está inactiva.
export async function getActiveCompanyBySlug(companySlug: string) {
  const slug = companySlugSchema.safeParse(companySlug);
  if (!slug.success) return null;
  return findActiveCompanyBySlug(slug.data);
}
