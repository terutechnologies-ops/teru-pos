import { describe, expect, it } from "vitest";

import {
  centsToAmount,
  centsToInput,
  inputToCents,
  paymentsPayload,
  paymentTotals,
  toCents,
} from "@/components/pos/sale/money";

describe("montos del pedido", () => {
  it("convierte entre texto, campo y centavos sin errores de coma flotante", () => {
    expect(toCents("16500")).toBe(1_650_000);
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
    expect(centsToAmount(1_650_000, 0)).toBe("16500");
    expect(centsToAmount(450, 2)).toBe("4.50");
    expect(centsToInput(3_300_000, 0)).toBe("33.000");
    expect(centsToInput(123_450, 2)).toBe("1.234,50");
    expect(inputToCents("33.000")).toBe(3_300_000);
    expect(inputToCents("")).toBe(0);
  });
});

describe("paymentTotals", () => {
  const methods = [
    { id: "cash", isCash: true },
    { id: "nequi", isCash: false },
  ];
  const total = 3_300_000; // $33.000

  it("efectivo que no alcanza: se aplica lo recibido y falta el resto", () => {
    // El cliente solo tiene $10.000 en efectivo.
    expect(paymentTotals([{ paymentMethodId: "cash", amount: "10.000" }], methods, total)).toMatchObject({
      cashApplied: 1_000_000,
      remaining: 2_300_000,
      change: 0,
      invalid: false,
    });
    // Y paga los $23.000 restantes por Nequi.
    const mixed = [
      { paymentMethodId: "cash", amount: "10.000" },
      { paymentMethodId: "nequi", amount: "23.000" },
    ];
    expect(paymentTotals(mixed, methods, total)).toMatchObject({ remaining: 0, change: 0, invalid: false });
    expect(paymentsPayload(mixed, methods, total, 0)).toEqual([
      { paymentMethodId: "cash", amount: "10000", tendered: null },
      { paymentMethodId: "nequi", amount: "23000", tendered: null },
    ]);
  });

  it("efectivo de más: se aplica lo que falta y el resto es cambio", () => {
    const payments = [
      { paymentMethodId: "nequi", amount: "23.000" },
      { paymentMethodId: "cash", amount: "20.000" },
    ];
    expect(paymentTotals(payments, methods, total)).toMatchObject({
      cashApplied: 1_000_000,
      change: 1_000_000,
      remaining: 0,
    });
    expect(paymentsPayload(payments, methods, total, 0)).toEqual([
      { paymentMethodId: "nequi", amount: "23000", tendered: null },
      { paymentMethodId: "cash", amount: "10000", tendered: "20000" },
    ]);
  });

  it("marca pagos vacíos, efectivo que sobra y pagos de más", () => {
    expect(
      paymentTotals([{ paymentMethodId: "nequi", amount: "" }], methods, total).invalid,
    ).toBe(true);
    // Nequi ya cubre todo: el efectivo no se aplicaría.
    expect(
      paymentTotals(
        [
          { paymentMethodId: "nequi", amount: "33.000" },
          { paymentMethodId: "cash", amount: "5.000" },
        ],
        methods,
        total,
      ),
    ).toMatchObject({ remaining: 0, invalid: true });
    expect(
      paymentTotals([{ paymentMethodId: "nequi", amount: "40.000" }], methods, total),
    ).toMatchObject({ remaining: -700_000 });
  });
});
