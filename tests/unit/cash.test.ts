import { describe, expect, it } from "vitest";

import { formatAmountInput, parseAmountInput } from "@/lib/company-formats";
import { closeShiftSchema, openShiftSchema } from "@/server/validations/cash";

describe("campo de monto", () => {
  it.each([
    ["200000", 0, "200.000"],
    ["200.0000", 0, "2.000.000"],
    ["$ 1a2b3", 0, "123"],
    ["007", 0, "7"],
    ["1234,567", 2, "1.234,56"],
    [",5", 2, "0,5"],
    ["1234,5", 0, "1.234"],
  ])("muestra %j con %i decimales como %j", (raw, decimals, shown) => {
    expect(formatAmountInput(raw, decimals)).toBe(shown);
  });

  it("vuelve al texto decimal con punto", () => {
    expect(parseAmountInput("200.000")).toBe("200000");
    expect(parseAmountInput("$ 1.234,5")).toBe("1234.5");
    expect(parseAmountInput("200000")).toBe("200000");
  });
});

describe("openShiftSchema", () => {
  it("normaliza el fondo según la moneda", () => {
    // Como se ve en el campo ("200.000") o sin separadores (sin JS).
    expect(openShiftSchema("COP").parse({ branchId: " ", openingAmount: "200.000" })).toEqual({
      branchId: "",
      openingAmount: "200000",
    });
    expect(openShiftSchema("COP").parse({ branchId: "", openingAmount: "100000" })).toMatchObject({
      openingAmount: "100000",
    });
    expect(openShiftSchema("USD").parse({ branchId: "x", openingAmount: "1.050,5" })).toEqual({
      branchId: "x",
      openingAmount: "1050.50",
    });
  });

  it.each([
    ["", "Escribe el fondo inicial."],
    ["100,5", "Esta moneda no usa centavos."],
    ["-1", "Escribe un fondo inicial válido (solo números, sin signos)."],
    ["99999999999", "El fondo inicial es demasiado alto."],
  ])("rechaza %j", (openingAmount, message) => {
    const result = openShiftSchema("COP").safeParse({ branchId: "", openingAmount });
    expect(result.error?.issues[0].message).toBe(message);
  });
});

describe("closeShiftSchema", () => {
  it("acepta cero, recorta la nota y la deja en null si está vacía", () => {
    expect(closeShiftSchema("COP").parse({ countedCash: "0", closingNote: "   " })).toEqual({
      countedCash: "0",
      closingNote: null,
    });
  });

  it("limita la nota a 200 caracteres", () => {
    const result = closeShiftSchema("COP").safeParse({
      countedCash: "1",
      closingNote: "x".repeat(201),
    });
    expect(result.error?.issues[0].path).toEqual(["closingNote"]);
  });
});
