import type { PosCatalog } from "@/server/services/sales";

import type { CartLine } from "./cart-panel";
import type { PaymentDraft } from "./money";

// Pedido en curso guardado en el navegador: sobrevive a una recarga o a un
// cierre accidental de la pestaña. Uno por empresa, persona y turno; se
// borra al cobrar o al vaciar.

export type SavedCart = {
  clientKey: string;
  lines: CartLine[];
  payments: PaymentDraft[];
};

export function cartStorageKey(companySlug: string, userId: string, shiftId: string) {
  return `teru-pos:pedido:${companySlug}:${userId}:${shiftId}`;
}

// UUID v4 con getRandomValues: randomUUID solo existe en contextos seguros
// (https o localhost) y el POS puede abrirse por la red local.
export function newClientKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Ajusta lo guardado al catálogo actual: quita productos que ya no se
// pueden vender y métodos inactivos, y toma nombres y precios vigentes.
export function reconcileCart(saved: unknown, catalog: PosCatalog): SavedCart | null {
  if (!saved || typeof saved !== "object") return null;
  const { clientKey, lines, payments } = saved as Partial<SavedCart>;
  if (typeof clientKey !== "string" || !Array.isArray(lines)) return null;

  const products = new Map(
    catalog.categories.flatMap((category) => category.products).map((product) => [product.id, product]),
  );
  const keptLines = lines.flatMap((line) => {
    const product = products.get(line?.productId);
    if (!product || product.blocked || !Number.isInteger(line.quantity) || line.quantity < 1) {
      return [];
    }
    return [
      {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: line.quantity,
        note: typeof line.note === "string" ? line.note : "",
      },
    ];
  });
  if (keptLines.length === 0) return null;

  const methods = new Set(catalog.paymentMethods.map((method) => method.id));
  const keptPayments = (Array.isArray(payments) ? payments : []).filter(
    (payment) => methods.has(payment?.paymentMethodId) && typeof payment.amount === "string",
  );
  return { clientKey, lines: keptLines, payments: keptPayments };
}

// El almacenamiento puede no existir o estar lleno (modo privado): el POS
// sigue funcionando, solo sin guardar.
export function loadCart(storageKey: string, catalog: PosCatalog) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? reconcileCart(JSON.parse(raw), catalog) : null;
  } catch {
    return null;
  }
}

export function clearCart(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
}

export function saveCart(storageKey: string, cart: SavedCart) {
  try {
    if (cart.lines.length === 0) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(cart));
  } catch {
    // Sin almacenamiento: el pedido solo vive en memoria.
  }
}
