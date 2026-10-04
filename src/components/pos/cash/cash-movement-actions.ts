"use server";

import { refresh } from "next/cache";

import { requirePermission } from "@/server/http/staff-session";
import { registerCashMovement } from "@/server/services/cash-movements";

import { CASH_MOVEMENT_KINDS, type CashMovementFormState } from "./cash-movement-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

export async function registerCashMovementAction(
  prev: CashMovementFormState,
  formData: FormData,
): Promise<CashMovementFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(field(formData, "company"), "sales.charge");
  const values = {
    type: field(formData, "type"),
    amount: field(formData, "amount"),
    categoryId: field(formData, "categoryId"),
    note: field(formData, "note"),
  };
  const image = formData.get("image");
  const file = image instanceof Blob && image.size > 0 ? image : null;
  const imageDropped = Boolean(file) && values.type === "EXPENSE";
  const failed = (message: string, fieldErrors: CashMovementFormState["fieldErrors"] = {}) => ({
    ...prev,
    status: "error" as const,
    message,
    fieldErrors,
    values,
    imageDropped,
  });

  let result;
  try {
    result = await registerCashMovement(session, values, file);
  } catch (error) {
    console.error("registerCashMovementAction: error inesperado", (error as Error).name);
    return failed(UNEXPECTED);
  }
  if (!result.ok) return failed(result.error, result.fieldErrors);

  refresh();
  const kind = CASH_MOVEMENT_KINDS[values.type as keyof typeof CASH_MOVEMENT_KINDS];
  return {
    status: "saved",
    message: result.receiptFailed
      ? `${kind.label} registrado sin foto: no se pudo subir el recibo.`
      : `${kind.label} registrado.`,
    fieldErrors: {},
    values: {},
    imageDropped: false,
    savedCount: prev.savedCount + 1,
  };
}
