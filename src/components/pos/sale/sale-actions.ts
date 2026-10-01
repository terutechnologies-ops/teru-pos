"use server";

import { refresh } from "next/cache";

import { requirePermission } from "@/server/http/staff-session";
import { checkout, type CheckoutResult } from "@/server/services/sales";

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
  // Tras vender (conteo del turno) o si cambió el catálogo, se recarga lo
  // que viene del servidor; el pedido en pantalla se conserva.
  if (result.ok || result.refresh) refresh();
  return result;
}
