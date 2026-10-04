import "server-only";

import { Prisma } from "@/generated/prisma/client";

// Resultado de un conteo confirmado con lo que guardó cada línea (ver ADR
// 0009). Todo en decimal exacto; la vista redondea al mostrar. Los montos y
// cantidades salen como texto.

export type CountLineValues = {
  difference: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  previousCounted: Prisma.Decimal | null;
  soldQuantity: Prisma.Decimal;
  purchasedQuantity: Prisma.Decimal;
  adjustedQuantity: Prisma.Decimal;
};

// Inicio: lo contado la vez anterior (sin conteo anterior, 0: la carga
// inicial va en los ajustes). Consumo real = vendido − diferencia: sale de
// la diferencia guardada (la del kardex) y no de recalcular el saldo, así
// el detalle cuadra con el kardex aunque una venta haya cruzado la
// confirmación. El % es la diferencia sobre lo vendido (negativo = faltó);
// sin ventas en el período no hay porcentaje. Valor: diferencia × costo;
// null = el insumo no tenía costo.
export function countLineResult(line: CountLineValues) {
  const sold = line.soldQuantity;
  return {
    start: (line.previousCounted ?? new Prisma.Decimal(0)).toString(),
    hasPrevious: line.previousCounted !== null,
    purchased: line.purchasedQuantity.toString(),
    adjusted: line.adjustedQuantity.toString(),
    sold: sold.toString(),
    realConsumption: sold.minus(line.difference).toString(),
    differencePercent: sold.greaterThan(0)
      ? line.difference.dividedBy(sold).times(100).toDecimalPlaces(1).toString()
      : null,
    value: line.unitCost === null ? null : line.difference.times(line.unitCost).toString(),
  };
}

export type CountLineResult = ReturnType<typeof countLineResult>;

// Totales del conteo: faltante (negativo), sobrante y neto valorizados, y
// cuántas líneas con diferencia no tienen costo (no suman).
export function countTotals(lines: { difference: string; value: string | null }[]) {
  let shortage = new Prisma.Decimal(0);
  let surplus = new Prisma.Decimal(0);
  let missingCost = 0;
  for (const line of lines) {
    if (Number(line.difference) === 0) continue;
    if (line.value === null) {
      missingCost += 1;
      continue;
    }
    const value = new Prisma.Decimal(line.value);
    if (value.isNegative()) shortage = shortage.plus(value);
    else surplus = surplus.plus(value);
  }
  return {
    shortage: shortage.toString(),
    surplus: surplus.toString(),
    net: shortage.plus(surplus).toString(),
    missingCost,
  };
}
