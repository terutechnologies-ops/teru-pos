import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import { convertQuantity } from "@/lib/units";

// Costo de las recetas con el costo de referencia de los insumos. Todo en
// decimal exacto; la vista redondea al mostrar. Los montos salen como texto.

export type CostLine = {
  quantity: Prisma.Decimal;
  unit: StockUnit;
  supply: { unit: StockUnit; unitCost: Prisma.Decimal | null };
};

// La cantidad se lleva a la unidad del insumo (120 g → 0.12 kg) y se
// multiplica por su costo. null = el insumo no tiene costo.
export function lineCost(line: CostLine): Prisma.Decimal | null {
  if (line.supply.unitCost === null) return null;
  const quantity = convertQuantity(line.quantity.toString(), line.unit, line.supply.unit);
  return new Prisma.Decimal(quantity).times(line.supply.unitCost);
}

export type RecipeCosting =
  | { status: "NO_RECIPE" }
  // Suma de las líneas con costo; sin margen, porque sería engañoso.
  | { status: "INCOMPLETE"; cost: string; missing: number }
  // Margen sobre el precio de venta; sin porcentaje si el precio es 0.
  | { status: "COMPLETE"; cost: string; margin: string; marginPercent: string | null };

export function recipeCosting(lines: CostLine[], price: Prisma.Decimal): RecipeCosting {
  if (lines.length === 0) return { status: "NO_RECIPE" };
  const costs = lines.map(lineCost);
  const cost = costs.reduce<Prisma.Decimal>(
    (sum, value) => (value === null ? sum : sum.plus(value)),
    new Prisma.Decimal(0),
  );
  const missing = costs.filter((value) => value === null).length;
  if (missing > 0) return { status: "INCOMPLETE", cost: cost.toString(), missing };

  const margin = price.minus(cost);
  return {
    status: "COMPLETE",
    cost: cost.toString(),
    margin: margin.toString(),
    marginPercent: price.isZero()
      ? null
      : margin.dividedBy(price).times(100).toDecimalPlaces(1).toString(),
  };
}
