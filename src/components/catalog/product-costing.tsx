import { formatMoney, formatPercent } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { RecipeCosting } from "@/server/services/costing";

function missingText(missing: number) {
  return missing === 1 ? "1 insumo sin costo" : `${missing} insumos sin costo`;
}

// Resumen compacto para la lista de productos.
export function CostingLine({ costing, currency }: { costing: RecipeCosting; currency: string }) {
  if (costing.status === "NO_RECIPE") {
    return <p className="text-xs text-muted-foreground">Sin receta</p>;
  }
  if (costing.status === "INCOMPLETE") {
    return (
      <p className="text-xs text-muted-foreground">
        Costo incompleto ({missingText(costing.missing)})
      </p>
    );
  }
  const negative = Number(costing.margin) < 0;
  return (
    <p className="text-xs text-muted-foreground">
      Costo {formatMoney(Number(costing.cost), currency)} · Margen{" "}
      <span className={cn("font-semibold", negative ? "text-destructive" : "text-foreground")}>
        {costing.marginPercent === null
          ? formatMoney(Number(costing.margin), currency)
          : formatPercent(costing.marginPercent)}
      </span>
    </p>
  );
}

// Precio, costo y margen del producto (página de la receta).
export function CostingSummary({
  costing,
  price,
  currency,
}: {
  costing: RecipeCosting;
  price: string;
  currency: string;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);
  const negative = costing.status === "COMPLETE" && Number(costing.margin) < 0;

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Precio de venta</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(price)}</dd>
      </div>
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Costo</dt>
        <dd className="mt-1 text-2xl font-extrabold tabular-nums">
          {costing.status === "NO_RECIPE" ? "—" : money(costing.cost)}
        </dd>
        <dd className="mt-1 text-xs text-muted-foreground">
          {costing.status === "NO_RECIPE"
            ? "Agrega la receta para calcularlo."
            : costing.status === "INCOMPLETE"
              ? `Parcial: ${missingText(costing.missing)}.`
              : "Según el costo de referencia de los insumos."}
        </dd>
      </div>
      <div className="rounded-xl bg-card p-5 shadow-sm">
        <dt className="text-xs font-semibold text-muted-foreground">Margen</dt>
        <dd
          className={cn(
            "mt-1 text-2xl font-extrabold tabular-nums",
            negative && "text-destructive",
          )}
        >
          {costing.status === "COMPLETE" ? money(costing.margin) : "—"}
        </dd>
        <dd className={cn("mt-1 text-xs", negative ? "text-destructive" : "text-muted-foreground")}>
          {costing.status === "COMPLETE"
            ? negative
              ? "El costo supera el precio de venta."
              : costing.marginPercent === null
                ? "Sin precio de venta."
                : `${formatPercent(costing.marginPercent)} del precio de venta.`
            : costing.status === "INCOMPLETE"
              ? "Completa el costo de los insumos."
              : "Sin receta."}
        </dd>
      </div>
    </dl>
  );
}
