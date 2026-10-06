import Link from "next/link";
import { History } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";
import { KARDEX_LIMIT, type KardexKind, type SupplyDetail } from "@/server/services/inventory";

const KIND_LABELS: Record<KardexKind, string> = {
  INITIAL: "Carga inicial",
  IN: "Entrada",
  OUT: "Salida",
  SALE: "Venta",
  SALE_VOID: "Anulación de venta",
  PURCHASE: "Compra",
  PURCHASE_VOID: "Anulación de compra",
  COUNT_IN: "Conteo",
  COUNT_OUT: "Conteo",
};

// " #N" del documento que originó el movimiento, con enlace si quien mira
// puede abrirlo.
function DocumentNumber({ number, href }: { number: number | null; href: string | null }) {
  if (number == null) return null;
  return (
    <>
      {" "}
      {href ? (
        <Link href={href} className="font-semibold text-link hover:underline">
          #{number}
        </Link>
      ) : (
        `#${number}`
      )}
    </>
  );
}

const isOutflow = (kind: KardexKind) =>
  kind === "OUT" || kind === "SALE" || kind === "PURCHASE_VOID" || kind === "COUNT_OUT";

// Historial de movimientos del insumo, del más reciente al más antiguo, con
// filtro por bodega (GET: queda en la dirección y funciona sin JS).
export function SupplyKardex({
  detail,
  companySlug,
  basePath,
  warehouseFilter,
}: {
  detail: SupplyDetail;
  companySlug: string;
  basePath: string;
  warehouseFilter: string;
}) {
  const { supply, movements, warehouseOptions, dateFormat, timeZone } = detail;
  const branchCount = new Set(warehouseOptions.map((option) => option.branchName)).size;

  return (
    <div className="flex flex-col gap-4">
      {warehouseOptions.length > 1 && (
        <form action={basePath} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="kardex-bodega" className="text-[13px] font-semibold">
            Bodega
          </label>
          <select
            id="kardex-bodega"
            name="bodega"
            defaultValue={warehouseFilter}
            className="h-10 min-w-0 rounded-lg border border-transparent bg-muted px-3 text-sm outline-none focus-visible:bg-card sm:w-72"
          >
            <option value="">Todas las bodegas</option>
            {warehouseOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {branchCount > 1 ? `${option.branchName} · ${option.name}` : option.name}
                {!option.isActive && " (inactiva)"}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" className="h-10 px-4">
              Filtrar
            </Button>
            {warehouseFilter && (
              <Button asChild variant="ghost" className="h-10 px-3">
                <Link href={basePath}>Limpiar</Link>
              </Button>
            )}
          </div>
        </form>
      )}

      {movements.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          text={
            warehouseFilter
              ? "Este insumo no tiene movimientos en esa bodega."
              : "Aquí verás la carga inicial y cada ajuste, con quién lo hizo y el saldo que dejó."
          }
        />
      ) : (
        // Solo la tabla se desplaza en pantallas angostas, no la página.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-semibold">Fecha</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Bodega</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Tipo</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Cantidad</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Saldo en bodega</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Motivo</th>
                <th scope="col" className="py-2 font-semibold">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((movement) => (
                <tr key={movement.id} className="align-top">
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                    {formatDateTime(movement.createdAt, dateFormat, timeZone)}
                  </td>
                  <td className="py-2.5 pr-3">{movement.warehouseName}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {KIND_LABELS[movement.kind]}
                    {movement.sale && (
                      <DocumentNumber
                        number={movement.sale.number}
                        href={
                          detail.canViewSales ? `/${companySlug}/ventas/${movement.sale.id}` : null
                        }
                      />
                    )}
                    {movement.purchase && (
                      <DocumentNumber
                        number={movement.purchase.number}
                        href={
                          detail.canViewPurchases
                            ? `/${companySlug}/compras/${movement.purchase.id}`
                            : null
                        }
                      />
                    )}
                    {movement.inventoryCount && (
                      <DocumentNumber
                        number={movement.inventoryCount.number}
                        href={`/${companySlug}/inventario/conteos/${movement.inventoryCount.id}`}
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pr-3 text-right font-semibold whitespace-nowrap tabular-nums",
                      isOutflow(movement.kind) && "text-destructive",
                    )}
                  >
                    {`${isOutflow(movement.kind) ? "−" : "+"}${formatQuantity(movement.quantity, supply.unit)}`}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pr-3 text-right whitespace-nowrap tabular-nums",
                      movement.balanceAfter.startsWith("-") && "font-semibold text-destructive",
                    )}
                  >
                    {formatQuantity(movement.balanceAfter, supply.unit)}
                  </td>
                  <td className="py-2.5 pr-3 break-words text-muted-foreground">
                    {movement.reason ?? "—"}
                  </td>
                  <td className="py-2.5 whitespace-nowrap">{movement.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === KARDEX_LIMIT && (
            <p className="mt-3 text-xs text-muted-foreground">
              Se muestran los últimos {KARDEX_LIMIT} movimientos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
