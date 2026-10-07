import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { ShoppingListItem } from "@/server/services/shopping-list";

import { SUPPLY_ALERT_INFO } from "./supply-fields";

// Secciones de la lista de compras: un título con su número y las filas
// (insumo, lo que queda e ideal, y a la derecha lo que hay que comprar).

export function ShoppingListSection({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div>
        <h2 className="text-lg font-extrabold">
          {title} <span className="text-muted-foreground tabular-nums">· {count}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Remaining({ item }: { item: ShoppingListItem }) {
  if (item.uninitialized) return <>Existencia desconocida</>;
  return (
    <>
      Quedan{" "}
      <span className={cn("font-semibold", item.negativeStock && "text-destructive")}>
        {formatQuantity(item.totalStock, item.unit)}
      </span>
      {item.idealStock !== null && ` · ideal ${formatQuantity(item.idealStock, item.unit)}`}
    </>
  );
}

export function ShoppingListRows({
  items,
  companySlug,
}: {
  items: ShoppingListItem[];
  companySlug: string;
}) {
  const supplyHref = (id: string) => `/${companySlug}/inventario/insumos/${id}`;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card px-5 shadow-sm sm:px-6">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={supplyHref(item.id)} className="truncate font-bold hover:underline">
                {item.name}
              </Link>
              {item.negativeStock && (
                <Badge variant="destructive">{SUPPLY_ALERT_INFO["saldo-negativo"].badge}</Badge>
              )}
              {item.uninitialized && (
                <Badge variant="outline">{SUPPLY_ALERT_INFO["sin-carga"].badge}</Badge>
              )}
              {item.belowMinimum && (
                <Badge variant="destructive">{SUPPLY_ALERT_INFO["bajo-minimo"].badge}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <Remaining item={item} />
              {item.toBuy !== null && item.negativeStock && " (el saldo negativo cuenta como 0)"}
            </p>
          </div>

          {item.toBuy !== null ? (
            <div className="text-right">
              <p className="text-xs font-semibold text-muted-foreground">Comprar</p>
              <p className="text-xl font-extrabold tabular-nums">
                {formatQuantity(item.toBuy, item.unit)}
              </p>
            </div>
          ) : (
            item.idealStock === null && (
              <Link
                href={`${supplyHref(item.id)}/editar`}
                className="text-sm font-semibold text-link hover:underline"
              >
                Definir stock ideal
              </Link>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
