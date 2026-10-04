import Link from "next/link";

import { CountValue } from "@/components/inventory/count-value";
import { formatPercent } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { CountDetail } from "@/server/services/inventory-counts";

type Line = CountDetail["lines"][number];

const isNegative = (value: string) => value.startsWith("-");

// Cantidad con "−" tipográfico; `signed` antepone "+" a las positivas.
function quantity(value: string, unit: Line["unit"], signed = false) {
  const sign = isNegative(value) ? "−" : signed && Number(value) > 0 ? "+" : "";
  return `${sign}${formatQuantity(value.replace("-", ""), unit)}`;
}

const cell = "py-2.5 pr-3 text-right whitespace-nowrap tabular-nums";

// Resultado de un conteo confirmado por insumo: lo que pasó en el período
// desde el conteo anterior (inicio, compras, ajustes y vendido = consumo
// teórico), el consumo real, el saldo del sistema al confirmar, lo
// contado y la diferencia (la que entró o salió del kardex), sobre lo
// vendido y valorizada.
export function CountLines({
  lines,
  currency,
  companySlug,
}: {
  lines: Line[];
  currency: string;
  companySlug: string;
}) {
  return (
    // Solo la tabla se desplaza en pantallas angostas, no la página.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-semibold">Insumo</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Inicio</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Compras</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Ajustes</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Vendido</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Consumo real</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Sistema</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Contado</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Diferencia</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">% s/ vendido</th>
            <th scope="col" className="py-2 text-right font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((line) => {
            const difference = Number(line.difference);
            return (
              <tr key={line.supplyId}>
                <td className="py-2.5 pr-3">
                  <Link
                    href={`/${companySlug}/inventario/insumos/${line.supplyId}`}
                    className="font-semibold hover:underline"
                  >
                    {line.name}
                  </Link>
                </td>
                <td className={cell}>
                  {line.hasPrevious ? (
                    quantity(line.start, line.unit)
                  ) : (
                    <span className="text-muted-foreground">Sin conteo</span>
                  )}
                </td>
                <td className={cell}>{quantity(line.purchased, line.unit)}</td>
                <td className={cell}>{quantity(line.adjusted, line.unit, true)}</td>
                <td className={cell}>{quantity(line.sold, line.unit)}</td>
                <td className={cell}>{quantity(line.realConsumption, line.unit)}</td>
                <td className={cn(cell, isNegative(line.system) && "font-semibold text-destructive")}>
                  {quantity(line.system, line.unit)}
                </td>
                <td className={cell}>{formatQuantity(line.counted, line.unit)}</td>
                <td className={cell}>
                  {difference === 0 ? (
                    <span className="text-muted-foreground">Cuadra</span>
                  ) : (
                    <span className={cn("font-semibold", difference < 0 && "text-destructive")}>
                      {quantity(line.difference, line.unit, true)}
                    </span>
                  )}
                </td>
                <td className={cn(cell, difference < 0 && "text-destructive")}>
                  {line.differencePercent === null || difference === 0
                    ? "—"
                    : `${difference > 0 ? "+" : "−"}${formatPercent(line.differencePercent.replace("-", ""))}`}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {difference === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : line.value === null ? (
                    <span className="text-muted-foreground">Sin costo</span>
                  ) : (
                    <CountValue value={line.value} currency={currency} className="font-semibold" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
