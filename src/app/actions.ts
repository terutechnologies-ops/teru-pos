"use server";

import { redirect } from "next/navigation";

import { getActiveCompanyBySlug } from "@/server/services/companies";
import { toCompanySlug } from "@/server/validations/auth";

export type FindCompanyState = { notFound: boolean; typed: string };

// POST y no GET: lo escrito no queda en la URL, así que al recargar la
// página vuelve limpia.
export async function findCompanyAction(
  _prev: FindCompanyState,
  formData: FormData,
): Promise<FindCompanyState> {
  const typed = String(formData.get("empresa") ?? "").slice(0, 200);
  const company = typed.trim()
    ? await getActiveCompanyBySlug(toCompanySlug(typed))
    : null;
  if (company) redirect(`/${company.slug}/login`);
  return { notFound: true, typed };
}
