"use server";

import { refresh } from "next/cache";

import type { StaffSessionDto } from "@/server/dto/auth";
import {
  getRequestContext,
  requirePermission,
} from "@/server/http/staff-session";
import {
  removeCompanyLogo,
  updateCompanyLogo,
  type CompanyLogoResult,
} from "@/server/services/companies";

export type LogoFormState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};

const UNEXPECTED = "No pudimos guardar el logo. Inténtalo de nuevo en un momento.";

// Subir y quitar el logo (asistente y configuración). Tras guardar se
// refresca: el logo aparece en el menú o en el encabezado.
async function run(
  formData: FormData,
  label: string,
  saved: string,
  action: (session: StaffSessionDto) => Promise<CompanyLogoResult>,
): Promise<LogoFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(
    String(formData.get("company") ?? ""),
    "company.manage",
  );
  let result: CompanyLogoResult;
  try {
    result = await action(session);
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).message);
    return { status: "error", message: UNEXPECTED };
  }
  if (!result.ok) return { status: "error", message: result.error };
  refresh();
  return { status: "saved", message: saved };
}

export async function uploadLogoAction(
  _prev: LogoFormState,
  formData: FormData,
): Promise<LogoFormState> {
  const file = formData.get("logo");
  return run(formData, "uploadLogoAction", "Logo actualizado.", async (session) =>
    updateCompanyLogo(
      session,
      file instanceof Blob ? file : null,
      await getRequestContext(),
    ),
  );
}

export async function removeLogoAction(
  _prev: LogoFormState,
  formData: FormData,
): Promise<LogoFormState> {
  return run(formData, "removeLogoAction", "Logo quitado.", async (session) =>
    removeCompanyLogo(session, await getRequestContext()),
  );
}
