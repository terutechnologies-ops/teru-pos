import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { resolveDayRange } from "@/lib/company-formats";
import { listActiveBranches } from "@/server/data/branches";
import { findOpenCashSession } from "@/server/data/cash-sessions";
import { findProduct, listPosCatalog } from "@/server/data/catalog";
import {
  findCompanyCurrency,
  findCompanyFormats,
  findCompanySettings,
} from "@/server/data/companies";
import { listPaymentMethods } from "@/server/data/payment-methods";
import {
  createSale,
  findSaleDetail,
  findSaleIdByNumber,
  listSaleCashiers,
  listSales,
  summarizeSales,
  voidSale,
  type SaleFilters,
} from "@/server/data/sales";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission, hasPermission } from "@/server/services/auth/permissions";
import { publicFileUrl } from "@/server/services/images";
import { saleSchema, voidSaleSchema, type VoidSaleInput } from "@/server/validations/sales";

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
    // Crédito todavía no se ofrece en el POS: llega con la venta a crédito
    // (cliente y cupo) de la cartera.
    paymentMethods: methods
      .filter((method) => !method.isCredit)
      .map(({ id, name, isCash }) => ({ id, name, isCash })),
  };
}

export type PosCatalog = Awaited<ReturnType<typeof getPosCatalog>>;
export type PosProduct = PosCatalog["categories"][number]["products"][number];

export type CheckoutResult =
  // alreadyRecorded: el mismo pedido ya se había cobrado (reintento).
  | {
      ok: true;
      saleId: string;
      number: number;
      total: string;
      change: string;
      alreadyRecorded: boolean;
    }
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
        saleId: result.saleId,
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
    case "CREDIT_REQUIRES_CUSTOMER":
      return fail("Para vender a crédito hay que elegir el cliente.", true);
    case "EMPTY_SALE":
      return fail("Agrega al menos un producto.");
    case "CASH_SESSION_NOT_FOUND":
    case "CASH_SESSION_CLOSED":
      return fail("Tu turno ya no está abierto.", true);
    case "NO_MAIN_WAREHOUSE":
      return fail("La sucursal no tiene bodega principal. Avisa al administrador.");
  }
}

// --- Ventas en el panel (sales.view / sales.void) ---------------------------

// Ventas que muestra la lista (las más recientes del rango).
export const SALES_LIST_LIMIT = 200;

// Valores de ?estado= en la dirección.
const STATUS_FILTERS = { completadas: "COMPLETED", anuladas: "VOIDED" } as const;

export type SaleStatusFilter = keyof typeof STATUS_FILTERS;

function isStatusFilter(value: string): value is SaleStatusFilter {
  return Object.hasOwn(STATUS_FILTERS, value);
}

// Lo que llega de la dirección, sin validar.
export type SalesQuery = {
  desde?: string;
  hasta?: string;
  cajero?: string;
  sucursal?: string;
  estado?: string;
};

export async function getSalesOverview(session: StaffSessionDto, query: SalesQuery) {
  assertPermission(session, "sales.view");
  const companyId = session.company.id;
  const formats = await findCompanyFormats(companyId);
  const days = resolveDayRange(query, formats.timeZone);
  const status = query.estado && isStatusFilter(query.estado) ? query.estado : "";
  const filters: SaleFilters = {
    from: days.start,
    to: days.end,
    userId: query.cajero || undefined,
    branchId: query.sucursal || undefined,
    status: status ? STATUS_FILTERS[status] : undefined,
  };

  const [list, summary, methods, cashiers, branches] = await Promise.all([
    listSales(companyId, filters, SALES_LIST_LIMIT),
    summarizeSales(companyId, filters),
    listPaymentMethods(companyId),
    listSaleCashiers(companyId),
    listActiveBranches(companyId),
  ]);
  const amounts = new Map(summary.byMethod.map((row) => [row.paymentMethodId, row.amount]));

  return {
    ...formats,
    filters: {
      from: days.from,
      to: days.to,
      cashierId: query.cajero ?? "",
      branchId: query.sucursal ?? "",
      status,
    },
    today: days.today,
    cashiers,
    // Solo con varias sucursales tiene sentido filtrar por sucursal.
    branches: branches.length > 1 ? branches.map(({ id, name }) => ({ id, name })) : [],
    summary: {
      completedCount: summary.completedCount,
      completedTotal: summary.completedTotal.toString(),
      voidedCount: summary.voidedCount,
      voidedTotal: summary.voidedTotal.toString(),
      // En el orden de los métodos; solo los que tuvieron ventas.
      byMethod: methods
        .filter((method) => amounts.has(method.id))
        .map((method) => ({ name: method.name, amount: amounts.get(method.id)!.toString() })),
    },
    sales: list.sales.map((sale) => ({
      id: sale.id,
      number: sale.number,
      createdAt: sale.createdAt,
      total: sale.total.toString(),
      voided: sale.status === "VOIDED",
      cashierName: sale.user.name,
      branchName: sale.branch.name,
      items: sale.lines.map((line) => `${line.quantity} × ${line.productName}`).join(", "),
      paymentMethods: [...new Set(sale.payments.map((p) => p.paymentMethod.name))].join(" + "),
    })),
    totalCount: list.total,
  };
}

export type SalesOverview = Awaited<ReturnType<typeof getSalesOverview>>;

// "Ir a la venta #N". null = no existe en la empresa.
export async function findSaleByNumber(session: StaffSessionDto, number: string) {
  assertPermission(session, "sales.view");
  const parsed = Number(number.trim().replace(/^#/, ""));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) return null;
  return findSaleIdByNumber(session.company.id, parsed);
}

export async function getSaleDetail(session: StaffSessionDto, saleId: string) {
  assertPermission(session, "sales.view");
  return loadSaleDetail(session.company.id, saleId);
}

// Detalle sin revisar permisos: lo comparten el panel y las hojas impresas.
async function loadSaleDetail(companyId: string, saleId: string) {
  const [sale, formats] = await Promise.all([
    findSaleDetail(companyId, saleId),
    findCompanyFormats(companyId),
  ]);
  if (!sale) return null;

  const shiftOpen = sale.cashSession.closedAt === null;
  const inventory = (type: "SALE" | "SALE_VOID") =>
    sale.stockMovements
      .filter((movement) => movement.type === type)
      .map((movement) => ({
        id: movement.id,
        supplyId: movement.supply.id,
        supplyName: movement.supply.name,
        unit: movement.supply.unit,
        warehouseName: movement.warehouse.name,
        // Sin signo: la sección dice si salió o volvió.
        quantity: movement.quantity.abs().toString(),
      }));
  const change = sale.payments.reduce(
    (sum, payment) => (payment.tendered ? sum.plus(payment.tendered.minus(payment.amount)) : sum),
    new Prisma.Decimal(0),
  );

  return {
    ...formats,
    sale: {
      id: sale.id,
      number: sale.number,
      createdAt: sale.createdAt,
      total: sale.total.toString(),
      change: change.toString(),
      cashierId: sale.userId,
      cashierName: sale.user.name,
      branchName: sale.branch.name,
      shift: { openedAt: sale.cashSession.openedAt, open: shiftOpen },
      voided:
        sale.status === "VOIDED"
          ? {
              at: sale.voidedAt!,
              byName: sale.voidedBy?.name ?? "—",
              reason: sale.voidReason ?? "",
            }
          : null,
      lines: sale.lines.map((line) => ({
        id: line.id,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toString(),
        lineTotal: line.lineTotal.toString(),
        note: line.note,
      })),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        methodName: payment.paymentMethod.name,
        amount: payment.amount.toString(),
        tendered: payment.tendered?.toString() ?? null,
      })),
      consumed: inventory("SALE"),
      returned: inventory("SALE_VOID"),
    },
    // Anulable: completada y con su turno todavía abierto.
    canVoid: sale.status === "COMPLETED" && shiftOpen,
  };
}

export type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSaleDetail>>>;

// --- Hojas impresas (comanda y soporte) -------------------------------------

// Quien ve las ventas (sales.view) imprime cualquiera; quien solo cobra, las
// de su turno abierto: reimprimir mientras atiende, no consultar el historial.
// null = no existe o no le corresponde (la página responde igual en ambos casos).
export async function getPrintableSale(session: StaffSessionDto, saleId: string) {
  const viewsAll = hasPermission(session.user.role, "sales.view");
  if (!viewsAll) assertPermission(session, "sales.charge");
  const companyId = session.company.id;
  const [detail, company] = await Promise.all([
    loadSaleDetail(companyId, saleId),
    findCompanySettings(companyId),
  ]);
  if (!detail || !company) return null;
  const { sale } = detail;
  if (!viewsAll && (sale.cashierId !== session.user.id || !sale.shift.open)) return null;

  return {
    currency: detail.currency,
    dateFormat: detail.dateFormat,
    timeZone: detail.timeZone,
    company: {
      name: company.name,
      taxId: company.taxId,
      address: company.address,
      phone: company.phone,
      logoUrl: publicFileUrl(company.logoPath),
    },
    sale: {
      id: sale.id,
      number: sale.number,
      createdAt: sale.createdAt,
      total: sale.total,
      change: sale.change,
      cashierName: sale.cashierName,
      branchName: sale.branchName,
      voided: sale.voided !== null,
      lines: sale.lines,
      payments: sale.payments,
      itemCount: sale.lines.reduce((sum, line) => sum + line.quantity, 0),
    },
  };
}

export type PrintableSale = NonNullable<Awaited<ReturnType<typeof getPrintableSale>>>;

export type VoidSaleResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors: Partial<Record<keyof VoidSaleInput, string>> };

const VOID_ERRORS = {
  NOT_FOUND: "La venta ya no existe. Actualiza la página.",
  ALREADY_VOIDED: "Esta venta ya estaba anulada.",
  CASH_SESSION_CLOSED: "El turno de esta venta ya se cerró: no se puede anular.",
} as const;

// Anula la venta: devuelve el inventario y deja de contar en el efectivo
// esperado del turno. La venta guarda quién, cuándo y por qué.
export async function voidSaleFromPanel(
  session: StaffSessionDto,
  saleId: string,
  input: VoidSaleInput,
): Promise<VoidSaleResult> {
  assertPermission(session, "sales.void");
  const parsed = voidSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { reason: parsed.error.issues[0].message } };
  }
  const result = await voidSale(session.company.id, {
    saleId,
    userId: session.user.id,
    reason: parsed.data.reason,
  });
  return result.status === "OK"
    ? { ok: true }
    : { ok: false, error: VOID_ERRORS[result.status], fieldErrors: {} };
}
