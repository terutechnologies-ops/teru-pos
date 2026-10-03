import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { PurchasesOverview } from "@/server/services/purchases";

// Compras confirmadas y anuladas del rango, de la más reciente a la más
// antigua. Toda la fila abre la compra.
export function PurchaseList({
  overview,
  basePath,
}: {
  overview: PurchasesOverview;
  basePath: string;
}) {
  const { purchases, currency } = overview;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {purchases.map((purchase) => (
        <li key={purchase.id}>
          <Link
            href={`${basePath}/${purchase.id}`}
            className="group flex items-center gap-4 px-5 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none sm:px-6"
          >
            <div
              className={cn("flex min-w-0 flex-1 flex-col gap-0.5", purchase.voided && "opacity-70")}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold tabular-nums">#{purchase.number}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {purchase.purchasedOn}
                </span>
                <span className="truncate font-semibold">· {purchase.supplierName}</span>
                {purchase.voided && <Badge variant="destructive">Anulada</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {purchase.supplierInvoice && `Factura ${purchase.supplierInvoice} · `}
                {purchase.warehouseName} ·{" "}
                {purchase.lineCount === 1 ? "1 insumo" : `${purchase.lineCount} insumos`}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-right font-extrabold tabular-nums",
                purchase.voided && "text-muted-foreground line-through",
              )}
            >
              {formatMoney(Number(purchase.total), currency)}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
