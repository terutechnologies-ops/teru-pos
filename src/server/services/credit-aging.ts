import { Prisma } from "@/generated/prisma/client";
import { addCalendarDays, calendarDay } from "@/lib/company-formats";

// Vencimiento de la cartera. Cada venta a crédito (la parte pagada con
// Crédito) vence el día de la venta, en la zona de la empresa, más el plazo
// actual del cliente. Los abonos van a la cuenta y cubren primero lo más
// viejo; lo que queda sin cubrir de una venta cuya fecha límite ya pasó está
// vencido (el día de la fecha límite todavía no).

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 86_400_000;

export type CreditCharge = { id: string; createdAt: Date; amount: Prisma.Decimal };

export type AgedCharge = {
  id: string;
  // "AAAA-MM-DD" en la zona de la empresa.
  dueDay: string;
  // Lo que los abonos aún no cubren.
  pending: Prisma.Decimal;
  // 0 si no está vencida.
  daysOverdue: number;
};

export function creditDueDay(createdAt: Date, creditDays: number, timeZone: string) {
  return addCalendarDays(calendarDay(createdAt, timeZone), creditDays);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// charges: ventas completadas del cliente (en cualquier orden); paid: total de
// abonos registrados; today: "AAAA-MM-DD" en la zona de la empresa.
export function ageCredit(
  charges: CreditCharge[],
  paid: Prisma.Decimal,
  { creditDays, timeZone, today }: { creditDays: number; timeZone: string; today: string },
) {
  let unapplied = paid;
  let overdue = ZERO;
  const aged = [...charges]
    .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
    .map((charge): AgedCharge => {
      const covered = Prisma.Decimal.min(charge.amount, unapplied);
      unapplied = unapplied.minus(covered);
      const pending = charge.amount.minus(covered);
      const dueDay = creditDueDay(charge.createdAt, creditDays, timeZone);
      const late = pending.greaterThan(0) ? Math.max(daysBetween(dueDay, today), 0) : 0;
      if (late > 0) overdue = overdue.plus(pending);
      return { id: charge.id, dueDay, pending, daysOverdue: late };
    });
  return { charges: aged, overdue };
}
