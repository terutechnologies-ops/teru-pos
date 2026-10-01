import "server-only";

import { findOpenCashSession } from "@/server/data/cash-sessions";
import { findProduct, listPosCatalog } from "@/server/data/catalog";
import { findCompanyCurrency } from "@/server/data/companies";
import { listPaymentMethods } from "@/server/data/payment-methods";
import { createSale } from "@/server/data/sales";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission } from "@/server/services/auth/permissions";
import { publicFileUrl } from "@/server/services/images";
import { saleSchema } from "@/server/validations/sales";

// Venta de mostrador desde el POS (sales.charge), siempre en el turno
// abierto de quien vende.

// Por qué un producto se ve pero no se puede vender.
export type PosBlockReason = "UNAVAILABLE" | "NO_RECIPE";

export async function getPosCatalog(session: StaffSessionDto) {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [currency, categories, methods] = await Promise.all([
    findCompanyCurrency(companyId),
    listPosCatalog(companyId),
    listPaymentMethods(companyId, { activeOnly: true }),
  ]);
  return {
    currency,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: category.products.map((product) => {
        const blocked: PosBlockReason | null = !product.isAvailable
          ? "UNAVAILABLE"
          : product._count.recipeItems === 0
            ? "NO_RECIPE"
            : null;
        return {
          id: product.id,
          name: product.name,
          price: product.price.toString(),
          imageUrl: publicFileUrl(product.imagePath),
          blocked,
        };
      }),
    })),
    paymentMethods: methods.map(({ id, name, isCash }) => ({ id, name, isCash })),
  };
}

export type PosCatalog = Awaited<ReturnType<typeof getPosCatalog>>;
export type PosProduct = PosCatalog["categories"][number]["products"][number];

export type CheckoutResult =
  // alreadyRecorded: el mismo pedido ya se había cobrado (reintento).
  | { ok: true; number: number; total: string; change: string; alreadyRecorded: boolean }
  // refresh: el catálogo o el turno cambiaron; la pantalla debe recargarse.
  | { ok: false; error: string; refresh: boolean };

const fail = (error: string, refresh = false): CheckoutResult => ({ ok: false, error, refresh });

async function productName(companyId: string, productId: string) {
  return (await findProduct(companyId, productId))?.name ?? "Un producto";
}

export async function checkout(session: StaffSessionDto, input: unknown): Promise<CheckoutResult> {
  assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const currency = await findCompanyCurrency(companyId);
  const parsed = saleSchema(currency).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const shift = await findOpenCashSession(companyId, session.user.id);
  if (!shift) return fail("Tu turno ya no está abierto.", true);

  const result = await createSale(companyId, {
    cashSessionId: shift.id,
    userId: session.user.id,
    lines: parsed.data.lines,
    payments: parsed.data.payments,
    clientKey: parsed.data.clientKey,
  });
  switch (result.status) {
    case "OK":
    case "ALREADY_RECORDED":
      return {
        ok: true,
        number: result.number,
        total: result.total.toString(),
        change: result.change.toString(),
        alreadyRecorded: result.status === "ALREADY_RECORDED",
      };
    case "PRODUCT_NOT_FOUND":
      return fail("Un producto del pedido ya no existe. Quítalo y vuelve a cobrar.", true);
    case "PRODUCT_UNAVAILABLE":
      return fail(
        `${await productName(companyId, result.productId)} ya no está disponible. Quítalo del pedido.`,
        true,
      );
    case "NO_RECIPE":
      return fail(
        `${await productName(companyId, result.productId)} no tiene receta y no se puede vender. Avisa al administrador.`,
        true,
      );
    case "PAYMENT_METHOD_NOT_FOUND":
      return fail("Un método de pago ya no está disponible. Elige otro.", true);
    case "PAYMENTS_MISMATCH":
      return fail("Los pagos deben sumar exactamente el total.");
    case "TENDERED_NOT_CASH":
      return fail("Solo el efectivo admite valor recibido.");
    case "TENDERED_SHORT":
      return fail("El valor recibido en efectivo no alcanza a cubrir su monto.");
    case "EMPTY_SALE":
      return fail("Agrega al menos un producto.");
    case "CASH_SESSION_NOT_FOUND":
    case "CASH_SESSION_CLOSED":
      return fail("Tu turno ya no está abierto.", true);
    case "NO_MAIN_WAREHOUSE":
      return fail("La sucursal no tiene bodega principal. Avisa al administrador.");
  }
}
