import { describe, expect, it } from "vitest";

import { categoryNameSchema } from "@/server/validations/catalog";

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
