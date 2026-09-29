"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import {
  registerStockMovement,
  type RegisterMovementResult,
} from "@/server/services/inventory";

import { readMovementForm, type MovementFormState } from "./movement-fields";

const UNEXPECTED = "No pudimos registrar el movimiento. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// Carga inicial o ajuste desde la ficha del insumo. Al guardar vuelve a la
// ficha (con el filtro del kardex que tenía) y muestra el aviso.
export async function stockMovementAction(
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field(formData, "company"), "inventory.manage");
  const supplyId = field(formData, "supplyId");
  const values = readMovementForm(formData);

  let result: RegisterMovementResult;
  try {
    result = await registerStockMovement(
      session,
      { supplyId, warehouseId: field(formData, "warehouseId") },
      values,
    );
  } catch (error) {
    console.error("stockMovementAction: error inesperado", (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, values };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: result.error ?? null,
      fieldErrors: result.fieldErrors,
      values,
    };
  }

  const query = new URLSearchParams({ aviso: "movimiento" });
  const filter = field(formData, "bodega");
  if (filter) query.set("bodega", filter);
  redirect(
    `/${session.company.slug}/inventario/insumos/${encodeURIComponent(supplyId)}?${query}`,
  );
}
