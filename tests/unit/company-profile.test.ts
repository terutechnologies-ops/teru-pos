import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatMoney,
  isCurrencyCode,
} from "@/lib/company-formats";
import { companyProfileSchema } from "@/server/validations/companies";

const base = {
  name: "Su Arepa",
  taxId: "",
  phone: "",
  email: "",
  address: "",
  currency: "COP",
  dateFormat: "DD/MM/YYYY",
};

describe("companyProfileSchema", () => {
  it("normaliza: recorta, vacíos a null, correo y moneda", () => {
    expect(
      companyProfileSchema.parse({
        ...base,
        name: "  Su Arepa  ",
        taxId: "  ",
        email: " Admin@SuArepa.CO ",
        currency: "usd",
      }),
    ).toEqual({
      name: "Su Arepa",
      taxId: null,
      phone: null,
      email: "admin@suarepa.co",
      address: null,
      currency: "USD",
      dateFormat: "DD/MM/YYYY",
    });
  });

  it.each([
    ["name", "A"],
    ["email", "no-es-correo"],
    ["currency", "XYZ"],
    ["currency", ""],
    ["dateFormat", "DD-MM-YY"],
    ["taxId", "x".repeat(31)],
    ["address", "x".repeat(201)],
  ])("rechaza %s = %j", (field, value) => {
    const result = companyProfileSchema.safeParse({ ...base, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });
});

describe("formatos", () => {
  it("valida monedas ISO 4217", () => {
    expect(isCurrencyCode("COP")).toBe(true);
    expect(isCurrencyCode("XYZ")).toBe(false);
  });

  it("formatea dinero con los decimales de cada moneda", () => {
    expect(formatMoney(16500, "COP")).toMatch(/^\$\s16\.500$/);
    expect(formatMoney(16500, "USD")).toMatch(/16\.500,00/);
  });

  it("formatea fechas sin depender de la zona horaria", () => {
    const date = new Date(Date.UTC(2026, 2, 24));
    expect(formatDate(date, "DD/MM/YYYY")).toBe("24/03/2026");
    expect(formatDate(date, "MM/DD/YYYY")).toBe("03/24/2026");
    expect(formatDate(date, "YYYY-MM-DD")).toBe("2026-03-24");
  });
});
