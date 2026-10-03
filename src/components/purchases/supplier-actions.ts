"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  createThirdPartySupplier,
  setThirdPartySupplierArchived,
  updateThirdPartySupplier,
  type SaveSupplierResult,
  type SupplierResult,
} from "@/server/services/third-parties";

import { readSupplierForm, type SupplierFormState } from "./supplier-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "purchases.manage");
}

async function saveSupplier(
  formData: FormData,
  label: string,
  notice: "creado" | "guardado",
  save: (
    session: Awaited<ReturnType<typeof sessionFrom>>,
    values: ReturnType<typeof readSupplierForm>,
  ) => Promise<SaveSupplierResult>,
): Promise<SupplierFormState> {
  const session = await sessionFrom(formData);
  const values = readSupplierForm(formData);
  let result: SaveSupplierResult;
  try {
    result = await save(session, values);
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, values };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: result.error ?? "Revisa los campos marcados.",
      fieldErrors: result.fieldErrors,
      values,
    };
  }
  redirect(`/${session.company.slug}/compras/proveedores?aviso=${notice}`);
}

export async function createSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  return saveSupplier(formData, "createSupplierAction", "creado", (session, values) =>
    createThirdPartySupplier(session, values),
  );
}

export async function updateSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  return saveSupplier(formData, "updateSupplierAction", "guardado", (session, values) =>
    updateThirdPartySupplier(session, field(formData, "id"), values),
  );
}

// Botones de cada fila: archivar y restaurar.
export async function supplierRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if ((intent !== "archive" && intent !== "restore") || !id) return { error: UNEXPECTED };

  let result: SupplierResult;
  try {
    result = await setThirdPartySupplierArchived(session, id, intent === "archive");
  } catch (error) {
    console.error("supplierRowAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED };
  }
  refresh();
  return { error: result.ok ? null : result.error };
}
