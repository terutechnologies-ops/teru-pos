import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { formatPercent } from "@/lib/company-formats";
import { lineCost, recipeCosting, type CostLine } from "@/server/services/costing";

const d = (value: string) => new Prisma.Decimal(value);
const line = (quantity: string, unit: CostLine["unit"], supplyUnit: CostLine["unit"], cost: string | null) => ({
  quantity: d(quantity),
  unit,
  supply: { unit: supplyUnit, unitCost: cost === null ? null : d(cost) },
});

describe("costo de una línea", () => {
  it("convierte la cantidad a la unidad del insumo antes de multiplicar", () => {
    // 120 g de un insumo a $ 3.200 el kg.
    expect(lineCost(line("120", "G", "KG", "3200"))?.toString()).toBe("384");
    // 0,05 kg de un insumo a $ 3,25 el g.
    expect(lineCost(line("0.05", "KG", "G", "3.25"))?.toString()).toBe("162.5");
    expect(lineCost(line("1", "UNIT", "UNIT", "2500"))?.toString()).toBe("2500");
    expect(lineCost(line("1", "UNIT", "UNIT", null))).toBeNull();
  });
});

describe("costo y margen de la receta", () => {
  it("sin líneas no hay receta", () => {
    expect(recipeCosting([], d("16500"))).toEqual({ status: "NO_RECIPE" });
  });

  it("con insumos sin costo da el costo parcial y sin margen", () => {
    expect(
      recipeCosting([line("120", "G", "KG", "3200"), line("1", "UNIT", "UNIT", null)], d("16500")),
    ).toEqual({ status: "INCOMPLETE", cost: "384", missing: 1 });
  });

  it("completa: margen en dinero y porcentaje sobre el precio", () => {
    expect(
      recipeCosting([line("120", "G", "KG", "3200"), line("0.05", "KG", "G", "3.25")], d("1000")),
    ).toEqual({ status: "COMPLETE", cost: "546.5", margin: "453.5", marginPercent: "45.4" });
  });

  it("margen negativo y precio cero", () => {
    expect(recipeCosting([line("1", "UNIT", "UNIT", "5000")], d("4000"))).toMatchObject({
      margin: "-1000",
      marginPercent: "-25",
    });
    expect(recipeCosting([line("1", "UNIT", "UNIT", "5000")], d("0"))).toMatchObject({
      margin: "-5000",
      marginPercent: null,
    });
  });
});

describe("formatPercent", () => {
  it("un decimal como máximo, con coma", () => {
    expect(formatPercent("70.1")).toBe("70,1 %");
    expect(formatPercent("45")).toBe("45 %");
    expect(formatPercent("-25")).toBe("-25 %");
  });
});
