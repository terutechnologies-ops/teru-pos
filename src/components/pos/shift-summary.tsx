import type { ReactNode } from "react";

import { formatDateTime, formatMoney, type DateFormat } from "@/lib/company-formats";
import type { ShiftDto } from "@/server/services/cash-sessions";

// Datos del turno (sin el esperado: conteo ciego). Se usa con el turno
// abierto y en el resumen del cierre.
export function ShiftSummary({
  shift,
  currency,
  dateFormat,
  timeZone,
  children,
}: {
  shift: ShiftDto;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  children?: ReactNode;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Item label="Sucursal" value={shift.branchName} />
      <Item label="Abierto" value={formatDateTime(shift.openedAt, dateFormat, timeZone)} />
      <Item label="Fondo inicial" value={formatMoney(Number(shift.openingAmount), currency)} />
      <Item
        label="Ventas"
        value={shift.salesCount === 1 ? "1 venta" : `${shift.salesCount} ventas`}
      />
      {children}
    </dl>
  );
}

export function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted px-4 py-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-bold tabular-nums">{value}</dd>
    </div>
  );
}
