"use server";

import { redirect } from "next/navigation";

import {
  clearStaffSessionCookie,
  getRequestContext,
  readStaffSessionToken,
} from "@/server/http/staff-session";
import { logoutStaff } from "@/server/services/auth/staff-auth";
import { getActiveCompanyBySlug } from "@/server/services/companies";

export async function logoutAction(companySlug: string) {
  const company = await getActiveCompanyBySlug(companySlug);
  const slug = company?.slug ?? companySlug;
  await logoutStaff(slug, await readStaffSessionToken(), await getRequestContext());
  await clearStaffSessionCookie(slug);
  redirect(`/${encodeURIComponent(slug)}/login`);
}
