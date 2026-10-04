import Link from "next/link";

import { formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { CountDetail } from "@/server/services/inventory-counts";

function Quantity({ value, unit }: { value: string; unit: CountDetail["lines"][number]["unit"] }) {
  return (
    <span className={cn(value.startsWith("-") && "font-semibold text-destructive")}>
      {value.startsWith("-") ? "−" : ""}
      {formatQuantity(value.replace("-", ""), unit)}
    </span>
  );
}

// Líneas de un conteo confirmado: saldo del sistema al confirmar, lo
// contado y la diferencia (la que entró o salió del kardex).
export function CountLines({
  lines,
  companySlug,
}: {
  lines: CountDetail["lines"];
  companySlug: string;
}) {
  return (
    // Solo la tabla se desplaza en pantallas angostas, no la página.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-semibold">Insumo</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Sistema</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Contado</th>
            <th scope="col" className="py-2 text-right font-semibold">Diferencia</th>
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
                <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular-nums">
                  <Quantity value={line.system} unit={line.unit} />
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular-nums">
                  {formatQuantity(line.counted, line.unit)}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                  {difference === 0 ? (
                    <span className="text-muted-foreground">Cuadra</span>
                  ) : (
                    <span className={cn("font-semibold", difference < 0 && "text-destructive")}>
                      {difference < 0 ? "−" : "+"}
                      {formatQuantity(line.difference.replace("-", ""), line.unit)}
                    </span>
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
