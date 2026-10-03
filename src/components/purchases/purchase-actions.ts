"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { RowActionState } from "@/components/shared/row-action-button";
import { requirePermission } from "@/server/http/staff-session";
import {
  addPurchaseItem,
  confirmPurchaseDraft,
  createPurchase,
  deletePurchase,
  removePurchaseItem,
  updatePurchaseHeader,
  updatePurchaseItem,
  voidConfirmedPurchase,
  type ConfirmPurchaseDraftResult,
  type PurchaseResult,
  type SavePurchaseHeaderResult,
  type SavePurchaseLineResult,
} from "@/server/services/purchases";

import {
  readHeaderForm,
  readLineForm,
  type PurchaseHeaderFormState,
  type PurchaseLineFormState,
  type VoidPurchaseFormState,
} from "./purchase-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "purchases.manage");
}

type Session = Awaited<ReturnType<typeof sessionFrom>>;

async function run<T>(label: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return null;
  }
}

// --- Encabezado ----------------------------------------------------------------

async function saveHeader(
  formData: FormData,
  label: string,
  save: (session: Session, values: ReturnType<typeof readHeaderForm>) => Promise<SavePurchaseHeaderResult>,
): Promise<{ session: Session; state: PurchaseHeaderFormState; purchaseId?: string }> {
  const session = await sessionFrom(formData);
  const values = readHeaderForm(formData);
  const result = await run(label, () => save(session, values));
  if (!result) {
    return { session, state: { status: "error", message: UNEXPECTED, fieldErrors: {}, values } };
  }
  if (!result.ok) {
    return {
      session,
      state: {
        status: "error",
        message: result.error ?? "Revisa los campos marcados.",
        fieldErrors: result.fieldErrors,
        values,
      },
    };
  }
  return {
    session,
    state: { status: "saved", message: null, fieldErrors: {}, values },
    purchaseId: result.purchaseId,
  };
}

// Crea el borrador y abre su página para agregar los insumos.
export async function createPurchaseAction(
  _prev: PurchaseHeaderFormState,
  formData: FormData,
): Promise<PurchaseHeaderFormState> {
  const { session, state, purchaseId } = await saveHeader(
    formData,
    "createPurchaseAction",
    createPurchase,
  );
  if (!purchaseId) return state;
  redirect(`/${session.company.slug}/compras/${purchaseId}`);
}

export async function updatePurchaseHeaderAction(
  _prev: PurchaseHeaderFormState,
  formData: FormData,
): Promise<PurchaseHeaderFormState> {
  const { state } = await saveHeader(formData, "updatePurchaseHeaderAction", (session, values) =>
    updatePurchaseHeader(session, field(formData, "id"), values),
  );
  if (state.status === "saved") refresh();
  return state;
}

// --- Líneas ----------------------------------------------------------------------

async function saveLine(
  formData: FormData,
  label: string,
  save: (session: Session, values: ReturnType<typeof readLineForm>) => Promise<SavePurchaseLineResult>,
): Promise<PurchaseLineFormState> {
  const session = await sessionFrom(formData);
  const values = readLineForm(formData);
  const result = await run(label, () => save(session, values));
  if (!result) return { status: "error", message: UNEXPECTED, fieldErrors: {}, values };
  if (!result.ok) {
    return { status: "error", message: result.error ?? null, fieldErrors: result.fieldErrors, values };
  }
  refresh();
  return { status: "saved", message: null, fieldErrors: {}, values };
}

export async function addPurchaseLineAction(
  _prev: PurchaseLineFormState,
  formData: FormData,
): Promise<PurchaseLineFormState> {
  return saveLine(formData, "addPurchaseLineAction", (session, values) =>
    addPurchaseItem(session, field(formData, "purchaseId"), values),
  );
}

export async function updatePurchaseLineAction(
  _prev: PurchaseLineFormState,
  formData: FormData,
): Promise<PurchaseLineFormState> {
  return saveLine(formData, "updatePurchaseLineAction", (session, values) =>
    updatePurchaseItem(session, field(formData, "id"), values),
  );
}

// Botón de cada línea: quitar el insumo de la compra.
export async function purchaseLineRowAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const id = field(formData, "id");
  if (field(formData, "intent") !== "remove" || !id) return { error: UNEXPECTED };
  const result: PurchaseResult | null = await run("purchaseLineRowAction", () =>
    removePurchaseItem(session, id),
  );
  if (!result) return { error: UNEXPECTED };
  refresh();
  return { error: result.ok ? null : result.error };
}

// --- Borrador completo -----------------------------------------------------------

export async function deletePurchaseAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const result = await run("deletePurchaseAction", () =>
    deletePurchase(session, field(formData, "id")),
  );
  if (!result) return { error: UNEXPECTED };
  if (!result.ok) return { error: result.error };
  redirect(`/${session.company.slug}/compras?aviso=eliminado`);
}

export async function confirmPurchaseAction(
  _prev: RowActionState,
  formData: FormData,
): Promise<RowActionState> {
  const session = await sessionFrom(formData);
  const id = field(formData, "id");
  const result: ConfirmPurchaseDraftResult | null = await run("confirmPurchaseAction", () =>
    confirmPurchaseDraft(session, id),
  );
  if (!result) return { error: UNEXPECTED };
  if (!result.ok) {
    // Lo que impidió confirmar puede haber cambiado la página (p. ej. un
    // insumo archivado): se recarga con el mensaje.
    refresh();
    return { error: result.error };
  }
  redirect(`/${session.company.slug}/compras/${id}?aviso=confirmada`);
}

// Anulación desde el detalle de la compra. Al terminar vuelve al detalle
// con el aviso.
export async function voidPurchaseAction(
  _prev: VoidPurchaseFormState,
  formData: FormData,
): Promise<VoidPurchaseFormState> {
  const session = await sessionFrom(formData);
  const id = field(formData, "id");
  const reason = field(formData, "reason");
  const result = await run("voidPurchaseAction", () =>
    voidConfirmedPurchase(session, id, { reason }),
  );
  if (!result) return { status: "error", message: UNEXPECTED, fieldErrors: {}, reason };
  if (!result.ok) {
    return { status: "error", message: result.error ?? null, fieldErrors: result.fieldErrors, reason };
  }
  redirect(`/${session.company.slug}/compras/${encodeURIComponent(id)}?aviso=anulada`);
}
