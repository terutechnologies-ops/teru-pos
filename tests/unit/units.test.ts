import { describe, expect, it } from "vitest";

import { convertQuantity, familyUnits, isStockUnit, sameUnitFamily } from "@/lib/units";

describe("unidades de medida", () => {
  it("convierte dentro de la familia sin perder precisión", () => {
    expect(convertQuantity("1.5", "KG", "G")).toBe("1500");
    expect(convertQuantity("250", "G", "KG")).toBe("0.25");
    expect(convertQuantity("0.5", "G", "KG")).toBe("0.0005");
    expect(convertQuantity("2", "L", "ML")).toBe("2000");
    expect(convertQuantity("1000", "ML", "L")).toBe("1");
    expect(convertQuantity("-0.125", "L", "ML")).toBe("-125");
    expect(convertQuantity("0", "KG", "G")).toBe("0");
    expect(convertQuantity("3", "UNIT", "UNIT")).toBe("3");
  });

  it("no convierte entre familias ni acepta texto inválido", () => {
    expect(sameUnitFamily("KG", "L")).toBe(false);
    expect(() => convertQuantity("1", "KG", "L")).toThrow();
    expect(() => convertQuantity("1", "UNIT", "G")).toThrow();
    expect(() => convertQuantity("1,5", "KG", "G")).toThrow();
  });

  it("reconoce solo las unidades definidas", () => {
    expect(isStockUnit("KG")).toBe(true);
    expect(isStockUnit("LB")).toBe(false);
  });

  it("lista las unidades de la misma familia", () => {
    expect(familyUnits("KG")).toEqual(["G", "KG"]);
    expect(familyUnits("ML")).toEqual(["ML", "L"]);
    expect(familyUnits("UNIT")).toEqual(["UNIT"]);
  });
});
