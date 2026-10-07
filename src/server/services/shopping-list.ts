import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { findCompanyFormats } from "@/server/data/companies";
import { listSupplies } from "@/server/data/inventory";
import type { StaffSessionDto } from "@/server/dto/auth";
import { assertPermission } from "@/server/services/auth/permissions";
import { toSupplyDto, type SupplyDto } from "@/server/services/inventory";

// Lista de compras: cuánto comprar de cada insumo para volver a su
// existencia ideal, sumando todas las bodegas (como el mínimo). Un saldo
// negativo cuenta como 0: indica entradas sin registrar, no insumo que se
// deba. La usan la página, la hoja impresa y el reporte de cierre, que lo
// dispara quien cierra el último turno (puede no tener inventory.manage):
// por eso loadShoppingList no pide permiso y getShoppingList sí.

export type ShoppingListItem = Pick<
  SupplyDto,
  | "id"
  | "name"
  | "unit"
  | "totalStock"
  | "idealStock"
  | "uninitialized"
  | "negativeStock"
  | "belowMinimum"
> & {
  // Cantidad sugerida en la unidad del insumo; null fuera de "Por comprar".
  toBuy: string | null;
};

export type ShoppingList = {
  // Por debajo de su ideal.
  toBuy: ShoppingListItem[];
  // Con ideal y una existencia que lo cubre.
  enough: ShoppingListItem[];
  // Sin ideal, o sin carga inicial (la existencia no se conoce).
  noSuggestion: ShoppingListItem[];
};

// Puro: clasifica los insumos (activos) conservando su orden.
export function buildShoppingList(supplies: SupplyDto[]): ShoppingList {
  const list: ShoppingList = { toBuy: [], enough: [], noSuggestion: [] };
  for (const supply of supplies) {
    const item: ShoppingListItem = {
      id: supply.id,
      name: supply.name,
      unit: supply.unit,
      totalStock: supply.totalStock,
      idealStock: supply.idealStock,
      uninitialized: supply.uninitialized,
      negativeStock: supply.negativeStock,
      belowMinimum: supply.belowMinimum,
      toBuy: null,
    };
    if (supply.idealStock === null || supply.uninitialized) {
      list.noSuggestion.push(item);
      continue;
    }
    const stock = Prisma.Decimal.max(supply.totalStock, 0);
    const toBuy = new Prisma.Decimal(supply.idealStock).minus(stock);
    if (toBuy.greaterThan(0)) list.toBuy.push({ ...item, toBuy: toBuy.toString() });
    else list.enough.push(item);
  }
  return list;
}

// Sin permiso: solo para procesos del sistema (reporte de cierre).
export async function loadShoppingList(companyId: string) {
  const rows = await listSupplies(companyId);
  return buildShoppingList(rows.map(toSupplyDto));
}

// Página y hoja impresa.
export async function getShoppingList(session: StaffSessionDto) {
  assertPermission(session, "inventory.manage");
  const companyId = session.company.id;
  const [list, formats] = await Promise.all([
    loadShoppingList(companyId),
    findCompanyFormats(companyId),
  ]);
  return {
    ...formats,
    ...list,
    companyName: session.company.name,
    printedAt: new Date(),
    printedBy: session.user.name,
  };
}

export type ShoppingListView = Awaited<ReturnType<typeof getShoppingList>>;
