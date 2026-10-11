"use server";

import { refresh } from "next/cache";
import { after } from "next/server";

import { requirePermission } from "@/server/http/staff-session";
import { sendCreditSaleEmail } from "@/server/services/credit-sale-email";
import {
  checkout,
  searchPosCustomers,
  type CheckoutResult,
  type PosCustomer,
} from "@/server/services/sales";

// Cobro del POS. Lo llama la pantalla de venta con el pedido armado en el
// navegador; el servicio valida todo de nuevo.
export async function checkoutAction(
  companySlug: string,
  payload: unknown,
): Promise<CheckoutResult> {
  const session = await requirePermission(companySlug, "sales.charge");
  let result: CheckoutResult;
  try {
    result = await checkout(session, payload);
  } catch (error) {
    console.error("checkoutAction: error inesperado", (error as Error).name);
    return {
      ok: false,
      error: "No pudimos registrar la venta. Inténtalo de nuevo en un momento.",
      refresh: false,
    };
  }
  // El correo de la compra a crédito sale después de responder: no demora el
  // cobro. Un reintento de la misma venta no lo repite.
  if (result.ok && result.onCredit && !result.alreadyRecorded) {
    const { saleId } = result;
    after(() => sendCreditSaleEmail(session.company.id, saleId));
  }
  // Tras vender (conteo del turno) o si cambió el catálogo, se recarga lo
  // que viene del servidor; el pedido en pantalla se conserva.
  if (result.ok || result.refresh) refresh();
  return result;
}

// Buscador de clientes de crédito al cobrar. null = falló la búsqueda.
export async function searchCustomersAction(
  companySlug: string,
  search: string,
): Promise<PosCustomer[] | null> {
  const session = await requirePermission(companySlug, "sales.charge");
  try {
    return await searchPosCustomers(session, typeof search === "string" ? search : "");
  } catch (error) {
    console.error("searchCustomersAction: error inesperado", (error as Error).name);
    return null;
  }
}
