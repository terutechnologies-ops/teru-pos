"use server";

import { redirect } from "next/navigation";

import { requirePlatformSession } from "@/server/http/platform-session";
import { getRequestContext } from "@/server/http/staff-session";
import { createCompanyFromPanel, resendOwnerWelcome } from "@/server/services/platform/companies";

import type { NewCompanyFormState, NewCompanyValues, ResendWelcomeState } from "./company-fields";

export async function createCompanyAction(
  _prev: NewCompanyFormState,
  formData: FormData,
): Promise<NewCompanyFormState> {
  const session = await requirePlatformSession();
  const values: NewCompanyValues = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    ownerEmail: String(formData.get("ownerEmail") ?? ""),
  };
  let result;
  try {
    result = await createCompanyFromPanel(session, values, await getRequestContext());
  } catch (error) {
    console.error("createCompanyAction: error inesperado", (error as Error).name);
    return { error: "No se pudo crear la empresa. Intenta de nuevo.", fieldErrors: {}, values };
  }
  if (!result.ok) return { error: null, fieldErrors: result.fieldErrors, values };
  redirect(`/teru/empresas/${result.companyId}?aviso=${result.emailSent ? "creada" : "creada-sin-correo"}`);
}

export async function resendWelcomeAction(
  _prev: ResendWelcomeState,
  formData: FormData,
): Promise<ResendWelcomeState> {
  const session = await requirePlatformSession();
  const companyId = String(formData.get("company") ?? "");
  let result;
  try {
    result = await resendOwnerWelcome(session, companyId, await getRequestContext());
  } catch (error) {
    console.error("resendWelcomeAction: error inesperado", (error as Error).name);
    return { error: "No se pudo reenviar la bienvenida. Intenta de nuevo." };
  }
  if (!result.ok) return { error: result.error };
  redirect(`/teru/empresas/${encodeURIComponent(companyId)}?aviso=reenviada`);
}
