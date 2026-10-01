"use server";

import { refresh } from "next/cache";

import type { NameFormState } from "@/components/shared/rename-form";
import type { RowActionState } from "@/components/shared/row-action-button";
import { getRequestContext, requirePermission } from "@/server/http/staff-session";
import {
  createPaymentMethod,
  movePaymentMethod,
  renamePaymentMethod,
  setPaymentMethodActive,
  type PaymentMethodResult,
} from "@/server/services/payment-methods";

import { PAYMENT_METHOD_INTENTS, type PaymentMethodIntent } from "./payment-method-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "payments.manage");
}

async function attempt(label: string, run: () => Promise<PaymentMethodResult>) {
  try {
    return await run();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { ok: false as const, error: UNEXPECTED };
  }
}

export async function createPaymentMethodAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const ctx = await getRequestContext();
  const result = await attempt("createPaymentMethodAction", () =>
    createPaymentMethod(session, name, ctx),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name: "" };
}

export async function renamePaymentMethodAction(
  _prev: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const session = await sessionFrom(formData);
  const name = field(formData, "name");
  const ctx = await getRequestContext();
  const result = await attempt("renamePaymentMethodAction", () =>
    renamePaymentMethod(session, field(formData, "id"), name, ctx),
  );
  if (!result.ok) return { status: "error", error: result.error, name };
  refresh();
  return { status: "saved", error: null, name };
}

function isIntent(value: string): value is PaymentMethodIntent {
  return (PAYMENT_METHOD_INTENTS as readonly string[]).includes(value);
}

// Botones de cada fila: mover y activar/desactivar.
export async function paymentMethodRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if (!isIntent(intent) || !id) return { error: UNEXPECTED };

  const ctx = await getRequestContext();
  const result = await attempt("paymentMethodRowAction", () => {
    switch (intent) {
      case "up":
      case "down":
        return movePaymentMethod(session, id, intent);
      case "activate":
      case "deactivate":
        return setPaymentMethodActive(session, id, intent === "activate", ctx);
    }
  });
  refresh();
  return { error: result.ok ? null : result.error };
}
