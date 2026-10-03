import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney, formatUnitCost } from "@/lib/company-formats";
import { formatQuantity, UNIT_INFO } from "@/lib/units";
import type { PurchaseDetail } from "@/server/services/purchases";

import { PurchaseLineForm } from "./purchase-line-form";
import { PurchaseLineRowButton } from "./purchase-line-row-button";

// Líneas de la compra en el orden en que se agregaron, con el costo por
// unidad del insumo que resulta de cada una. En borrador se pueden cambiar
// y quitar.
export function PurchaseLines({
  purchase,
  companySlug,
}: {
  purchase: PurchaseDetail;
  companySlug: string;
}) {
  const editable = purchase.draft !== null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {purchase.lines.map((line) => (
        <li
          key={line.id}
          className="flex flex-col gap-2 py-3 first:pt-0 md:flex-row md:items-start md:justify-between"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {purchase.canViewSupplies ? (
                <Link
                  href={`/${companySlug}/inventario/insumos/${line.supply.id}`}
                  className="truncate font-bold hover:underline"
                >
                  {line.supply.name}
                </Link>
              ) : (
                <span className="truncate font-bold">{line.supply.name}</span>
              )}
              {line.supply.isArchived && <Badge variant="secondary">Insumo archivado</Badge>}
              {editable && line.supply.uninitialized && (
                <Badge variant="outline">Sin carga inicial</Badge>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm tabular-nums">
              <span className="font-semibold">{formatQuantity(line.quantity, line.unit)}</span>
              <span className="text-muted-foreground">
                · {formatMoney(Number(line.lineTotal), purchase.currency)} · costo{" "}
                {formatUnitCost(line.unitCost, purchase.currency)}/
                {UNIT_INFO[line.supply.unit].symbol}
              </span>
            </p>
            {editable && (
              <PurchaseLineForm
                key={`${line.quantity}-${line.unit}-${line.lineTotal}`}
                companySlug={companySlug}
                id={line.id}
                currency={purchase.currency}
                supplyUnit={line.supply.unit}
                quantity={line.quantity}
                unit={line.unit}
                lineTotal={line.lineTotal}
              />
            )}
          </div>
          {editable && (
            <div className="flex shrink-0 justify-end">
              <PurchaseLineRowButton
                companySlug={companySlug}
                id={line.id}
                supplyName={line.supply.name}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
