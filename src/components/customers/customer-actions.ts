"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { RowActionState } from "@/components/shared/row-action-button";
import { getRequestContext, requirePermission } from "@/server/http/staff-session";
import {
  createCreditCustomer,
  setCreditCustomerArchived,
  updateCreditCustomer,
  type CustomerResult,
  type SaveCustomerResult,
} from "@/server/services/customers";

import { readCustomerForm, type CustomerFormState } from "./customer-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "customers.manage");
}

async function saveCustomer(
  formData: FormData,
  label: string,
  notice: "creado" | "guardado",
  save: (
    session: Awaited<ReturnType<typeof sessionFrom>>,
    values: ReturnType<typeof readCustomerForm>,
  ) => Promise<SaveCustomerResult>,
): Promise<CustomerFormState> {
  const session = await sessionFrom(formData);
  const values = readCustomerForm(formData);
  let result: SaveCustomerResult;
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
  redirect(`/${session.company.slug}/clientes?aviso=${notice}`);
}

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  return saveCustomer(formData, "createCustomerAction", "creado", async (session, values) =>
    createCreditCustomer(session, values, await getRequestContext()),
  );
}

export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  return saveCustomer(formData, "updateCustomerAction", "guardado", async (session, values) =>
    updateCreditCustomer(session, field(formData, "id"), values, await getRequestContext()),
  );
}

// Botones de cada fila: archivar y restaurar.
export async function customerRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if ((intent !== "archive" && intent !== "restore") || !id) return { error: UNEXPECTED };

  let result: CustomerResult;
  try {
    result = await setCreditCustomerArchived(session, id, intent === "archive");
  } catch (error) {
    console.error("customerRowAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED };
  }
  refresh();
  return { error: result.ok ? null : result.error };
}
