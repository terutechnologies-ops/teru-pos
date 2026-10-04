"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  confirmCount,
  deleteCount,
  saveCount,
  startCount,
} from "@/server/services/inventory-counts";

import { countValues, readCountForm, type CountFormState, type CountIntent } from "./count-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "inventory.manage");
}

async function run<T>(label: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return null;
  }
}

// "Nuevo conteo" / "Registrar conteo": abre el borrador de la bodega (lo
// crea si no tiene uno).
export async function startCountAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const result = await run("startCountAction", () =>
    startCount(session, field(formData, "warehouseId")),
  );
  if (!result) return { error: UNEXPECTED };
  if (!result.ok) return { error: result.error };
  redirect(`/${session.company.slug}/inventario/conteos/${result.countId}`);
}

// Guardar avance o confirmar (botón con intent): ambos envían todo lo
// escrito.
export async function saveCountAction(
  _prev: CountFormState,
  formData: FormData,
): Promise<CountFormState> {
  const session = await sessionFrom(formData);
  const id = field(formData, "id");
  const intent: CountIntent = field(formData, "intent") === "confirm" ? "confirm" : "save";
  const entries = readCountForm(formData);
  const values = countValues(entries);

  if (intent === "save") {
    const result = await run("saveCountAction", () => saveCount(session, id, entries));
    if (!result) return { status: "error", intent, message: UNEXPECTED, fieldErrors: {}, values };
    if (!result.ok) {
      return {
        status: "error",
        intent,
        message: result.error ?? null,
        fieldErrors: result.fieldErrors,
        values,
      };
    }
    refresh();
    return { status: "saved", intent, message: "Avance guardado.", fieldErrors: {}, values };
  }

  const result = await run("confirmCountAction", () => confirmCount(session, id, entries));
  if (!result) return { status: "error", intent, message: UNEXPECTED, fieldErrors: {}, values };
  if (!result.ok) {
    // Lo que impidió confirmar puede haber cambiado la página (p. ej. un
    // insumo archivado): se recarga con el mensaje.
    refresh();
    return {
      status: "error",
      intent,
      message: result.error ?? null,
      fieldErrors: result.fieldErrors,
      values,
    };
  }
  redirect(`/${session.company.slug}/inventario/conteos/${encodeURIComponent(id)}?aviso=confirmado`);
}

export async function deleteCountAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const result = await run("deleteCountAction", () => deleteCount(session, field(formData, "id")));
  if (!result) return { error: UNEXPECTED };
  if (!result.ok) return { error: result.error };
  redirect(`/${session.company.slug}/inventario/conteos?aviso=eliminado`);
}
