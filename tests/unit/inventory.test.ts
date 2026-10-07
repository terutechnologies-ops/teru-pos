import { describe, expect, it } from "vitest";

import { formatUnitCost } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import {
  quantitySchema,
  stockMovementSchema,
  supplySchema,
  unitCostSchema,
} from "@/server/validations/inventory";

const error = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error!.issues[0].message;

describe("quantitySchema", () => {
  it("normaliza el texto sin pasar por float", () => {
    expect(quantitySchema.parse(" 2.500 ")).toBe("2.5");
    expect(quantitySchema.parse("007")).toBe("7");
    expect(quantitySchema.parse("0.125")).toBe("0.125");
    expect(quantitySchema.parse("3.0")).toBe("3");
  });

  it("rechaza vacíos, signos, comas, más de 3 decimales y cantidades enormes", () => {
    expect(error(quantitySchema.safeParse(""))).toBe("Escribe la cantidad.");
    expect(error(quantitySchema.safeParse("-1"))).toBe(
      "Escribe una cantidad válida (solo números, sin signos).",
    );
    expect(error(quantitySchema.safeParse("1,5"))).toBe(
      "Escribe una cantidad válida (solo números, sin signos).",
    );
    expect(error(quantitySchema.safeParse("0.0005"))).toBe("Usa máximo 3 decimales.");
    expect(error(quantitySchema.safeParse("100000000000"))).toBe(
      "La cantidad es demasiado alta.",
    );
  });
});

describe("supplySchema", () => {
  it("acepta un insumo con o sin mínimo", () => {
    expect(
      supplySchema.parse({ name: " Harina  de maíz ", unit: "KG", minStock: "5.50", idealStock: "12.0", unitCost: "3200" }),
    ).toEqual({ name: "Harina de maíz", unit: "KG", minStock: "5.5", idealStock: "12", unitCost: "3200" });
    const empty = supplySchema.parse({ name: "Queso", unit: "G", minStock: "  ", idealStock: "", unitCost: "" });
    expect([empty.minStock, empty.idealStock, empty.unitCost]).toEqual([null, null, null]);
  });

  it("exige una unidad válida y un mínimo no negativo", () => {
    expect(error(supplySchema.safeParse({ name: "Queso", unit: "", minStock: "", idealStock: "", unitCost: "" }))).toBe(
      "Elige una unidad.",
    );
    expect(error(supplySchema.safeParse({ name: "Queso", unit: "LB", minStock: "", idealStock: "", unitCost: "" }))).toBe(
      "Elige una unidad.",
    );
    expect(error(supplySchema.safeParse({ name: "Queso", unit: "G", minStock: "-2", idealStock: "", unitCost: "" }))).toBe(
      "Escribe una cantidad válida (solo números, sin signos).",
    );
  });

  it("el stock ideal no puede ser menor que el mínimo", () => {
    const parse = (minStock: string, idealStock: string) =>
      supplySchema.safeParse({ name: "Queso", unit: "KG", minStock, idealStock, unitCost: "" });
    expect(error(parse("5", "4.999"))).toBe("El stock ideal no puede ser menor que el mínimo.");
    expect(parse("5", "5").success).toBe(true);
    expect(parse("", "3").success).toBe(true);
    expect(parse("5", "").success).toBe(true);
    // Con el mínimo inválido solo se reporta ese campo.
    const invalid = parse("abc", "3");
    expect(invalid.success).toBe(false);
    expect(new Set(invalid.error?.issues.map((issue) => issue.path.join(".")))).toEqual(
      new Set(["minStock"]),
    );
  });
});

describe("formatQuantity", () => {
  it("usa separadores es-CO y el símbolo de la unidad", () => {
    expect(formatQuantity("10.5", "KG")).toBe("10,5 kg");
    expect(formatQuantity("1500", "G")).toBe("1.500 g");
    expect(formatQuantity("0.125", "L")).toBe("0,125 l");
    expect(formatQuantity("24", "UNIT")).toBe("24 und");
  });
});

describe("stockMovementSchema", () => {
  const issues = (input: { kind: string; quantity: string; reason: string }) => {
    const result = stockMovementSchema.safeParse(input);
    return result.success
      ? null
      : Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
  };

  it("la carga inicial no exige motivo; el ajuste sí", () => {
    expect(stockMovementSchema.parse({ kind: "INITIAL", quantity: "12.50", reason: " " })).toEqual({
      kind: "INITIAL",
      quantity: "12.5",
      reason: null,
    });
    expect(
      stockMovementSchema.parse({ kind: "OUT", quantity: "2", reason: " Conteo   físico " }),
    ).toEqual({ kind: "OUT", quantity: "2", reason: "Conteo físico" });
    expect(issues({ kind: "IN", quantity: "2", reason: "ok" })).toEqual({
      reason: "Escribe el motivo del ajuste (mínimo 3 caracteres).",
    });
  });

  it("rechaza tipo inválido, cantidad cero o negativa y motivos largos", () => {
    expect(issues({ kind: "", quantity: "0.000", reason: "x".repeat(201) })).toEqual({
      kind: "Elige si es una entrada o una salida.",
      quantity: "La cantidad debe ser mayor que cero.",
      reason: "El motivo no puede superar 200 caracteres.",
    });
    expect(issues({ kind: "ADJUSTMENT", quantity: "-1", reason: "Conteo" })).toEqual({
      kind: "Elige si es una entrada o una salida.",
      quantity: "Escribe una cantidad válida (solo números, sin signos).",
    });
  });
});

describe("unitCostSchema", () => {
  it("admite hasta 4 decimales y normaliza sin pasar por float", () => {
    expect(unitCostSchema.parse("3.2500")).toBe("3.25");
    expect(unitCostSchema.parse("0.0001")).toBe("0.0001");
    expect(unitCostSchema.parse("0")).toBe("0");
    expect(error(unitCostSchema.safeParse("1.23456"))).toBe("Usa máximo 4 decimales.");
    expect(error(unitCostSchema.safeParse("3,25"))).toBe(
      "Escribe un costo válido (solo números, sin signos).",
    );
    expect(error(unitCostSchema.safeParse("10000000000"))).toBe("El costo es demasiado alto.");
  });
});

describe("formatUnitCost", () => {
  it("usa los decimales de la moneda y hasta 4 si hacen falta", () => {
    expect(formatUnitCost("3200", "COP")).toMatch(/^\$\s3\.200$/);
    expect(formatUnitCost("3.25", "COP")).toMatch(/^\$\s3,25$/);
    expect(formatUnitCost("0.0125", "USD")).toMatch(/0,0125$/);
    expect(formatUnitCost("4", "USD")).toMatch(/4,00$/);
  });
});
