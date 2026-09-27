import { describe, expect, it } from "vitest";

import {
  categoryNameSchema,
  priceSchema,
  productSchema,
} from "@/server/validations/catalog";

describe("categoryNameSchema", () => {
  it("recorta y une espacios repetidos", () => {
    expect(categoryNameSchema.parse("  Bebidas   frías ")).toBe("Bebidas frías");
  });

  it.each([
    ["vacío", ""],
    ["solo espacios", "    "],
    ["una letra", "A"],
    ["muy largo", "x".repeat(61)],
  ])("rechaza %s", (_label, value) => {
    expect(categoryNameSchema.safeParse(value).success).toBe(false);
  });
});

describe("priceSchema", () => {
  it.each([
    ["COP", "16500", "16500"],
    ["COP", "16500.00", "16500"],
    ["COP", "0", "0"],
    ["USD", "4.5", "4.50"],
    ["USD", "007.10", "7.10"],
    ["EUR", "12", "12.00"],
  ])("%s %j → %j", (currency, value, expected) => {
    expect(priceSchema(currency).parse(value)).toBe(expected);
  });

  it.each([
    ["COP", "4.5", "Esta moneda no usa centavos."],
    // "16.500" escrito con punto de miles: se lee 16,5 y COP no tiene centavos.
    ["COP", "16.500", "Esta moneda no usa centavos."],
    ["USD", "4.505", "Usa máximo 2 decimales."],
    ["COP", "-3", "Escribe un precio válido (solo números, sin signos)."],
    ["COP", "16,500", "Escribe un precio válido (solo números, sin signos)."],
    ["COP", "", "Escribe el precio."],
    ["COP", "99999999999", "El precio es demasiado alto."],
  ])("rechaza %s %j", (currency, value, message) => {
    const result = priceSchema(currency).safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});

describe("productSchema", () => {
  it("normaliza nombre, descripción vacía y precio", () => {
    expect(
      productSchema("COP").parse({
        name: "  Reina   pepiada ",
        categoryId: "c1",
        description: "  ",
        price: "16500",
      }),
    ).toEqual({ name: "Reina pepiada", categoryId: "c1", description: null, price: "16500" });
  });

  it("exige nombre, categoría y descripción corta", () => {
    const result = productSchema("COP").safeParse({
      name: "A",
      categoryId: "",
      description: "x".repeat(201),
      price: "1",
    });
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      "categoryId",
      "description",
      "name",
    ]);
  });
});
