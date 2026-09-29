import type { StockUnit } from "@/generated/prisma/enums";

// Unidades de medida del inventario, fijas en código (ver ADR 0005). Se usa
// en el servidor y en el cliente. Dentro de una familia las unidades se
// convierten; entre familias, no (1 kg de harina no son "unidades").

export type UnitFamily = "MASS" | "VOLUME" | "COUNT";

type UnitInfo = {
  label: string;
  symbol: string;
  family: UnitFamily;
  // Potencia de 10 respecto a la unidad base de la familia (g, ml, und).
  // Todas las conversiones son desplazamientos decimales exactos.
  exponent: number;
};

export const STOCK_UNITS = ["G", "KG", "ML", "L", "UNIT"] as const satisfies readonly StockUnit[];

export const UNIT_INFO: Record<StockUnit, UnitInfo> = {
  G: { label: "Gramos", symbol: "g", family: "MASS", exponent: 0 },
  KG: { label: "Kilogramos", symbol: "kg", family: "MASS", exponent: 3 },
  ML: { label: "Mililitros", symbol: "ml", family: "VOLUME", exponent: 0 },
  L: { label: "Litros", symbol: "l", family: "VOLUME", exponent: 3 },
  UNIT: { label: "Unidades", symbol: "und", family: "COUNT", exponent: 0 },
};

export function isStockUnit(value: string): value is StockUnit {
  return (STOCK_UNITS as readonly string[]).includes(value);
}

export function sameUnitFamily(a: StockUnit, b: StockUnit) {
  return UNIT_INFO[a].family === UNIT_INFO[b].family;
}

// Convierte una cantidad en texto decimal ("1.5") sin pasar por float:
// 1.5 kg → "1500" g. Lanza si las unidades son de familias distintas.
export function convertQuantity(value: string, from: StockUnit, to: StockUnit) {
  if (!sameUnitFamily(from, to)) {
    throw new Error(`No se puede convertir ${from} a ${to}`);
  }
  return shiftDecimal(value, UNIT_INFO[from].exponent - UNIT_INFO[to].exponent);
}

// Mueve el punto decimal `places` posiciones (positivo = multiplica).
function shiftDecimal(value: string, places: number) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Cantidad inválida: ${value}`);
  const [, sign, int, frac = ""] = match;

  const digits = int + frac;
  const point = int.length + places;
  const padded =
    point < 0 ? "0".repeat(-point) + digits : digits.padEnd(point, "0");
  const at = Math.max(point, 0);

  const whole = padded.slice(0, at).replace(/^0+(?=\d)/, "") || "0";
  const decimals = padded.slice(at).replace(/0+$/, "");
  const result = decimals ? `${whole}.${decimals}` : whole;
  return sign && result !== "0" ? `-${result}` : result;
}
