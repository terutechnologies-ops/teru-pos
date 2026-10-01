import { describe, expect, it } from "vitest";

import { newClientKey, reconcileCart } from "@/components/pos/sale/cart-storage";
import type { PosCatalog } from "@/server/services/sales";

const catalog: PosCatalog = {
  currency: "COP",
  categories: [
    {
      id: "c1",
      name: "Arepas",
      products: [
        { id: "arepa", name: "Arepa de queso", price: "17000", imageUrl: null, blocked: null },
        { id: "pollo", name: "Arepa de pollo", price: "18000", imageUrl: null, blocked: "UNAVAILABLE" },
      ],
    },
  ],
  paymentMethods: [{ id: "cash", name: "Efectivo", isCash: true }],
};

describe("pedido guardado", () => {
  it("genera claves UUID v4 distintas", () => {
    const key = newClientKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientKey()).not.toBe(key);
  });

  it("se ajusta al catálogo: precios vigentes, sin bloqueados ni métodos inactivos", () => {
    const saved = {
      clientKey: "k",
      lines: [
        { productId: "arepa", name: "Viejo nombre", price: "16500", quantity: 2, note: "sin sal" },
        { productId: "pollo", name: "Arepa de pollo", price: "18000", quantity: 1, note: "" },
        { productId: "borrado", name: "X", price: "1", quantity: 1, note: "" },
        { productId: "arepa", name: "Mala", price: "1", quantity: 0, note: "" },
      ],
      payments: [
        { paymentMethodId: "cash", amount: "34.000" },
        { paymentMethodId: "nequi", amount: "1.000" },
      ],
    };
    expect(reconcileCart(saved, catalog)).toEqual({
      clientKey: "k",
      lines: [
        { productId: "arepa", name: "Arepa de queso", price: "17000", quantity: 2, note: "sin sal" },
      ],
      payments: [{ paymentMethodId: "cash", amount: "34.000" }],
    });
  });

  it("descarta lo que no es un pedido o quedó vacío", () => {
    expect(reconcileCart(null, catalog)).toBeNull();
    expect(reconcileCart("texto", catalog)).toBeNull();
    expect(reconcileCart({ clientKey: 1, lines: [] }, catalog)).toBeNull();
    expect(
      reconcileCart(
        { clientKey: "k", lines: [{ productId: "pollo", quantity: 1 }], payments: [] },
        catalog,
      ),
    ).toBeNull();
  });
});
