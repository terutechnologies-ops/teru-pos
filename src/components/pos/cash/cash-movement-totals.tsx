import { formatMoney } from "@/lib/company-formats";
import type { CashMovementTotals } from "@/server/services/cash-movements";

import { Item } from "../shift-summary";

// Gastos, retiros e ingresos del turno (sin anulados), como ítems de un
// ShiftSummary. No revela el esperado (conteo ciego).
export function CashMovementTotalItems({
  totals,
  currency,
}: {
  totals: CashMovementTotals;
  currency: string;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);
  return (
    <>
      <Item label="Gastos" value={money(totals.expenses)} />
      <Item label="Retiros" value={money(totals.withdrawals)} />
      <Item label="Ingresos" value={money(totals.deposits)} />
    </>
  );
}
