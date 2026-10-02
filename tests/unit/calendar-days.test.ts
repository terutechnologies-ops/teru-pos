import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  calendarDay,
  isCalendarDay,
  startOfCalendarDay,
} from "@/lib/company-formats";

describe("días del calendario por zona horaria", () => {
  it("el día de un instante depende de la zona", () => {
    // 3:30 a. m. UTC del 1 de octubre = 10:30 p. m. del 30 de septiembre en Bogotá.
    const instant = new Date(Date.UTC(2026, 9, 1, 3, 30));
    expect(calendarDay(instant, "America/Bogota")).toBe("2026-09-30");
    expect(calendarDay(instant, "Europe/Madrid")).toBe("2026-10-01");
  });

  it("el día empieza a la medianoche local", () => {
    expect(startOfCalendarDay("2026-09-30", "America/Bogota").toISOString()).toBe(
      "2026-09-30T05:00:00.000Z",
    );
    // Madrid en horario de verano (UTC+2) y de invierno (UTC+1).
    expect(startOfCalendarDay("2026-07-01", "Europe/Madrid").toISOString()).toBe(
      "2026-06-30T22:00:00.000Z",
    );
    expect(startOfCalendarDay("2026-12-01", "Europe/Madrid").toISOString()).toBe(
      "2026-11-30T23:00:00.000Z",
    );
    // Día del cambio de horario en Nueva York (8 de marzo de 2026).
    expect(startOfCalendarDay("2026-03-08", "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(startOfCalendarDay("2026-03-09", "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });

  it("valida y suma días", () => {
    expect(isCalendarDay("2026-09-30")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("30/09/2026")).toBe(false);
    expect(addCalendarDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
