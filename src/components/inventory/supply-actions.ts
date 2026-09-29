"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  createInventorySupply,
  setInventorySupplyArchived,
  updateInventorySupply,
  type InventoryResult,
  type SaveSupplyResult,
} from "@/server/services/inventory";

import { readSupplyForm, type SupplyFormState } from "./supply-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "inventory.manage");
}

async function saveSupply(
  formData: FormData,
  label: string,
  notice: "creado" | "guardado",
  save: (
    session: Awaited<ReturnType<typeof sessionFrom>>,
    values: ReturnType<typeof readSupplyForm>,
  ) => Promise<SaveSupplyResult>,
): Promise<SupplyFormState> {
  const session = await sessionFrom(formData);
  const values = readSupplyForm(formData);
  let result: SaveSupplyResult;
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
  redirect(`/${session.company.slug}/inventario/insumos?aviso=${notice}`);
}

export async function createSupplyAction(
  _prev: SupplyFormState,
  formData: FormData,
): Promise<SupplyFormState> {
  return saveSupply(formData, "createSupplyAction", "creado", (session, values) =>
    createInventorySupply(session, values),
  );
}

export async function updateSupplyAction(
  _prev: SupplyFormState,
  formData: FormData,
): Promise<SupplyFormState> {
  return saveSupply(formData, "updateSupplyAction", "guardado", (session, values) =>
    updateInventorySupply(session, field(formData, "id"), values),
  );
}

// Botones de cada fila: archivar y restaurar.
export async function supplyRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if ((intent !== "archive" && intent !== "restore") || !id) return { error: UNEXPECTED };

  let result: InventoryResult;
  try {
    result = await setInventorySupplyArchived(session, id, intent === "archive");
  } catch (error) {
    console.error("supplyRowAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED };
  }
  refresh();
  return { error: result.ok ? null : result.error };
}
