"use server";

import { refresh } from "next/cache";

import type { NameFormState } from "@/components/shared/rename-form";
import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  createInventoryWarehouse,
  renameInventoryWarehouse,
  setInventoryWarehouseActive,
  type InventoryResult,
} from "@/server/services/inventory";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "inventory.manage");
}

async function attempt(label: string, run: () => Promise<InventoryResult>) {
  try {
    return await run();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { ok: false as const, error: UNEXPECTED };
  }
}

export async function createWarehouseAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const result = await attempt("createWarehouseAction", () =>
    createInventoryWarehouse(session, { branchId: field(formData, "branchId"), name }),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name: "" };
}

export async function renameWarehouseAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const result = await attempt("renameWarehouseAction", () =>
    renameInventoryWarehouse(session, field(formData, "id"), name),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name };
}

// Botones de cada fila: activar y desactivar.
export async function warehouseRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if ((intent !== "activate" && intent !== "deactivate") || !id) return { error: UNEXPECTED };

  const result = await attempt("warehouseRowAction", () =>
    setInventoryWarehouseActive(session, id, intent === "activate"),
  );
  refresh();
  return { error: result.ok ? null : result.error };
}
