import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { ageCredit, creditDueDay } from "@/server/services/credit-aging";

const D = (value: string | number) => new Prisma.Decimal(value);
const BOGOTA = "America/Bogota";

function charge(id: string, iso: string, amount: number) {
  return { id, createdAt: new Date(iso), amount: D(amount) };
}

// Ventas del 1, 5 y 20 de septiembre (mediodía en Bogotá), plazo de 15 días.
const charges = [
  charge("c", "2026-09-20T17:00:00Z", 30000),
  charge("a", "2026-09-01T17:00:00Z", 10000),
  charge("b", "2026-09-05T17:00:00Z", 20000),
];

function view(result: ReturnType<typeof ageCredit>) {
  return {
    overdue: result.overdue.toString(),
    charges: result.charges.map((c) => [c.id, c.dueDay, c.pending.toString(), c.daysOverdue]),
  };
}

describe("vencimiento de la cartera", () => {
  it("los abonos cubren primero lo más viejo; lo vencido es lo que quedó sin cubrir", () => {
    expect(view(ageCredit(charges, D(15000), { creditDays: 15, timeZone: BOGOTA, today: "2026-10-01" }))).toEqual({
      overdue: "15000",
      charges: [
        ["a", "2026-09-16", "0", 0],
        ["b", "2026-09-20", "15000", 11],
        ["c", "2026-10-05", "30000", 0],
      ],
    });
  });

  it("el día de la fecha límite todavía no está vencida; al día siguiente sí", () => {
    const options = { creditDays: 15, timeZone: BOGOTA };
    expect(ageCredit(charges, D(0), { ...options, today: "2026-09-16" }).overdue.toString()).toBe("0");
    const nextDay = ageCredit(charges, D(0), { ...options, today: "2026-09-17" });
    expect(nextDay.overdue.toString()).toBe("10000");
    expect(nextDay.charges[0].daysOverdue).toBe(1);
  });

  it("con todo pagado no hay vencido; sin abonos todo lo vencido cuenta", () => {
    const options = { creditDays: 15, timeZone: BOGOTA, today: "2026-12-31" };
    expect(view(ageCredit(charges, D(60000), options)).overdue).toBe("0");
    expect(view(ageCredit(charges, D(0), options)).overdue).toBe("60000");
    expect(view(ageCredit([], D(0), options))).toEqual({ overdue: "0", charges: [] });
  });

  it("el día de la venta es el de la zona de la empresa", () => {
    // 1 de octubre a las 3:00 UTC = 30 de septiembre a las 22:00 en Bogotá.
    const late = new Date("2026-10-01T03:00:00Z");
    expect(creditDueDay(late, 30, BOGOTA)).toBe("2026-10-30");
    expect(creditDueDay(late, 30, "Europe/Madrid")).toBe("2026-10-31");
    expect(creditDueDay(late, 0, BOGOTA)).toBe("2026-09-30");
  });
});
