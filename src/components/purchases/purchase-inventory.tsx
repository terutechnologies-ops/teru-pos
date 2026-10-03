import Link from "next/link";

import { formatQuantity } from "@/lib/units";
import type { PurchaseDetail } from "@/server/services/purchases";

type Movement = PurchaseDetail["inventory"]["entered"][number];

function MovementList({
  title,
  movements,
  sign,
  canViewSupplies,
  companySlug,
}: {
  title: string;
  movements: Movement[];
  sign: "+" | "−";
  canViewSupplies: boolean;
  companySlug: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col divide-y divide-border text-sm">
        {movements.map((movement) => (
          <li key={movement.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">
              {canViewSupplies ? (
                <Link
                  href={`/${companySlug}/inventario/insumos/${movement.supplyId}`}
                  className="font-semibold hover:underline"
                >
                  {movement.supplyName}
                </Link>
              ) : (
                <span className="font-semibold">{movement.supplyName}</span>
              )}
              <span className="text-muted-foreground"> · {movement.warehouseName}</span>
            </span>
            <span
              className={
                sign === "−"
                  ? "shrink-0 font-semibold text-destructive tabular-nums"
                  : "shrink-0 font-semibold tabular-nums"
              }
            >
              {sign}
              {formatQuantity(movement.quantity, movement.unit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Lo que la compra entró a la bodega al confirmarse y, si se anuló, lo que
// salió. En la unidad de cada insumo.
export function PurchaseInventory({
  purchase,
  companySlug,
}: {
  purchase: PurchaseDetail;
  companySlug: string;
}) {
  const { entered, removed } = purchase.inventory;
  return (
    <div className="flex flex-col gap-5">
      <MovementList
        title="Entró a la bodega"
        movements={entered}
        sign="+"
        canViewSupplies={purchase.canViewSupplies}
        companySlug={companySlug}
      />
      {removed.length > 0 && (
        <MovementList
          title="Salió al anular"
          movements={removed}
          sign="−"
          canViewSupplies={purchase.canViewSupplies}
          companySlug={companySlug}
        />
      )}
    </div>
  );
}
