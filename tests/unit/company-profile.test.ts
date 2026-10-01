import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatMoney,
  isSupportedCurrency,
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
  timeZone: "America/Bogota",
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
      timeZone: "America/Bogota",
    });
  });

  it.each([
    ["name", "A"],
    ["email", "no-es-correo"],
    ["currency", "XYZ"],
    ["currency", "ARS"],
    ["currency", ""],
    ["dateFormat", "DD-MM-YY"],
    ["timeZone", "America/Bogotá"],
    ["timeZone", "Asia/Tokyo"],
    ["timeZone", ""],
    ["taxId", "x".repeat(31)],
    ["address", "x".repeat(201)],
  ])("rechaza %s = %j", (field, value) => {
    const result = companyProfileSchema.safeParse({ ...base, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });
});

describe("formatos", () => {
  it("acepta solo las monedas habilitadas", () => {
    expect(isSupportedCurrency("COP")).toBe(true);
    expect(isSupportedCurrency("ARS")).toBe(false);
    expect(isSupportedCurrency("XYZ")).toBe(false);
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

  it("muestra fecha y hora en la zona de la empresa, no en UTC", () => {
    // 01:05 UTC del 29 = 8:05 p. m. del 28 en Bogotá (UTC−5).
    const date = new Date(Date.UTC(2026, 8, 29, 1, 5));
    const bogota = "America/Bogota";
    expect(formatDateTime(date, "DD/MM/YYYY", bogota)).toMatch(/^28\/09\/2026 8:05\sp\.\sm\.$/);
    expect(formatDateTime(date, "YYYY-MM-DD", bogota)).toMatch(/^2026-09-28 8:05/);
    expect(
      formatDateTime(new Date(Date.UTC(2026, 8, 28, 15, 0)), "MM/DD/YYYY", bogota),
    ).toMatch(/^09\/28\/2026 10:00\sa\.\sm\.$/);
    // En Madrid (UTC+2 en septiembre) ya es el 29 a las 3:05 a. m.
    expect(formatDateTime(date, "DD/MM/YYYY", "Europe/Madrid")).toMatch(
      /^29\/09\/2026 3:05\sa\.\sm\.$/,
    );
  });
});
