import { describe, expect, it } from "vitest";

import { formatQuantity } from "@/lib/units";
import { quantitySchema, supplySchema } from "@/server/validations/inventory";

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
    expect(supplySchema.parse({ name: " Harina  de maíz ", unit: "KG", minStock: "5.50" })).toEqual({
      name: "Harina de maíz",
      unit: "KG",
      minStock: "5.5",
    });
    expect(supplySchema.parse({ name: "Queso", unit: "G", minStock: "  " }).minStock).toBeNull();
  });

  it("exige una unidad válida y un mínimo no negativo", () => {
    expect(error(supplySchema.safeParse({ name: "Queso", unit: "", minStock: "" }))).toBe(
      "Elige una unidad.",
    );
    expect(error(supplySchema.safeParse({ name: "Queso", unit: "LB", minStock: "" }))).toBe(
      "Elige una unidad.",
    );
    expect(error(supplySchema.safeParse({ name: "Queso", unit: "G", minStock: "-2" }))).toBe(
      "Escribe una cantidad válida (solo números, sin signos).",
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
