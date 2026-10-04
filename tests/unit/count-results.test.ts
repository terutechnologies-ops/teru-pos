import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { countLineResult, countTotals, type CountLineValues } from "@/server/services/count-results";

const d = (value: string) => new Prisma.Decimal(value);

function line(values: {
  difference: string;
  unitCost?: string | null;
  previousCounted?: string | null;
  sold?: string;
  purchased?: string;
  adjusted?: string;
}): CountLineValues {
  return {
    difference: d(values.difference),
    unitCost: values.unitCost == null ? null : d(values.unitCost),
    previousCounted: values.previousCounted == null ? null : d(values.previousCounted),
    soldQuantity: d(values.sold ?? "0"),
    purchasedQuantity: d(values.purchased ?? "0"),
    adjustedQuantity: d(values.adjusted ?? "0"),
  };
}

describe("resultado de una línea del conteo", () => {
  it("consumo real, % sobre lo vendido y valor del faltante", () => {
    // Inicio 10 kg, compras 5, ajustes −0,1, vendido 0,4: sistema 14,5;
    // se cuentan 14,3 → faltan 0,2 kg a $ 3.000.
    expect(
      countLineResult(
        line({
          difference: "-0.2",
          unitCost: "3000",
          previousCounted: "10",
          sold: "0.4",
          purchased: "5",
          adjusted: "-0.1",
        }),
      ),
    ).toEqual({
      start: "10",
      hasPrevious: true,
      purchased: "5",
      adjusted: "-0.1",
      sold: "0.4",
      realConsumption: "0.6",
      differencePercent: "-50",
      value: "-600",
    });
  });

  it("sin conteo anterior empieza en 0; sobrante sin costo", () => {
    const result = countLineResult(line({ difference: "1.5", adjusted: "10", sold: "3" }));
    expect(result).toMatchObject({
      start: "0",
      hasPrevious: false,
      realConsumption: "1.5",
      differencePercent: "50",
      value: null,
    });
  });

  it("sin ventas (o con más anulado que vendido) no hay porcentaje", () => {
    expect(countLineResult(line({ difference: "-1" })).differencePercent).toBeNull();
    expect(countLineResult(line({ difference: "-1", sold: "-0.2" })).differencePercent).toBeNull();
    // Redondeo a un decimal: 1/3 = 33,3 %.
    expect(countLineResult(line({ difference: "1", sold: "3" })).differencePercent).toBe("33.3");
  });
});

describe("totales del conteo", () => {
  it("separa faltante y sobrante y no suma lo que no tiene costo", () => {
    expect(
      countTotals([
        { difference: "-0.2", value: "-600" },
        { difference: "-1", value: "-250.5" },
        { difference: "2", value: "1000" },
        { difference: "1", value: null },
        { difference: "0", value: "0" },
        { difference: "0", value: null },
      ]),
    ).toEqual({ shortage: "-850.5", surplus: "1000", net: "149.5", missingCost: 1 });
  });

  it("todo cuadra", () => {
    expect(countTotals([{ difference: "0", value: "0" }])).toEqual({
      shortage: "0",
      surplus: "0",
      net: "0",
      missingCost: 0,
    });
  });
});
