"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/server/http/staff-session";
import { closeShift, openShift, type ShiftResult } from "@/server/services/cash-sessions";

import type { ShiftFormState } from "./shift-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

async function attempt(label: string, run: () => Promise<ShiftResult>): Promise<ShiftResult> {
  try {
    return await run();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { ok: false, error: UNEXPECTED };
  }
}

export async function openShiftAction(
  _prev: ShiftFormState,
  formData: FormData,
): Promise<ShiftFormState> {
  const session = await requirePermission(field(formData, "company"), "sales.charge");
  const values = {
    branchId: field(formData, "branchId"),
    openingAmount: field(formData, "openingAmount"),
  };
  const result = await attempt("openShiftAction", () => openShift(session, values));
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors ?? {}, values };
  redirect(`/${session.company.slug}/pos`);
}

export async function closeShiftAction(
  _prev: ShiftFormState,
  formData: FormData,
): Promise<ShiftFormState> {
  const session = await requirePermission(field(formData, "company"), "sales.charge");
  const values = {
    countedCash: field(formData, "countedCash"),
    closingNote: field(formData, "closingNote"),
  };
  const result = await attempt("closeShiftAction", () => closeShift(session, values));
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors ?? {}, values };
  redirect(`/${session.company.slug}/pos/turno/${result.cashSessionId}`);
}
