import { describe, expect, it } from "vitest";

import { DEFAULT_PRINT_SETTINGS, parsePrintSettings } from "@/components/printing/print-settings";
import { printSheetHref } from "@/components/printing/print-sheets";
import { taxIdText } from "@/components/printing/sheet-parts";

describe("ajustes de impresión del equipo", () => {
  it("lee lo guardado y descarta lo que no entiende", () => {
    expect(parsePrintSettings({ paperWidth: "58", printTicketOnCheckout: false })).toEqual({
      paperWidth: "58",
      printTicketOnCheckout: false,
    });
    expect(parsePrintSettings({ paperWidth: "110", printTicketOnCheckout: "sí" })).toEqual(
      DEFAULT_PRINT_SETTINGS,
    );
    expect(parsePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings("80")).toEqual(DEFAULT_PRINT_SETTINGS);
  });
});

describe("hojas impresas", () => {
  it("arma la dirección de cada hoja", () => {
    expect(printSheetHref("su-arepa", "comanda", "abc")).toBe("/su-arepa/imprimir/comanda/abc");
    expect(printSheetHref("su-arepa", "soporte", "abc", { auto: true })).toBe(
      "/su-arepa/imprimir/soporte/abc?auto=1",
    );
  });

  it("antepone NIT salvo que ya venga el tipo de identificación", () => {
    expect(taxIdText("900.000.000-0")).toBe("NIT 900.000.000-0");
    expect(taxIdText("RUT 76.123.456-7")).toBe("RUT 76.123.456-7");
  });
});
