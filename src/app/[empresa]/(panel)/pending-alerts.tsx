import Link from "next/link";
import { ChevronRight, CircleCheck, ListChecks } from "lucide-react";

import { PRODUCT_ALERT_INFO } from "@/components/catalog/product-fields";
import { SUPPLY_ALERT_INFO } from "@/components/inventory/supply-fields";
import { SectionTitle } from "@/components/shared/section-title";
import { cn } from "@/lib/utils";
import type { PendingAlerts as PendingAlertCounts } from "@/server/services/alerts";
import { PRODUCT_ALERTS } from "@/server/services/catalog";
import { SUPPLY_ALERTS } from "@/server/services/inventory";

type PendingRow = {
  id: string;
  title: string;
  hint: string;
  count: number;
  href: string;
  // Frena la venta o descuadra el inventario: el número va en rojo.
  urgent: boolean;
};

const URGENT = new Set(["sin-receta", "saldo-negativo"]);

// Tarjeta "Pendientes" del inicio: solo las alertas con casos, cada una con
// enlace a su lista filtrada.
export function PendingAlerts({
  alerts,
  companySlug,
}: {
  alerts: PendingAlertCounts;
  companySlug: string;
}) {
  const rows: PendingRow[] = [];
  if (alerts.products) {
    for (const alert of PRODUCT_ALERTS) {
      rows.push({
        id: alert,
        ...PRODUCT_ALERT_INFO[alert],
        count: alerts.products[alert],
        href: `/${companySlug}/catalogo/productos?alerta=${alert}`,
        urgent: URGENT.has(alert),
      });
    }
  }
  if (alerts.supplies) {
    for (const alert of SUPPLY_ALERTS) {
      rows.push({
        id: alert,
        ...SUPPLY_ALERT_INFO[alert],
        count: alerts.supplies[alert],
        href: `/${companySlug}/inventario/insumos?alerta=${alert}`,
        urgent: URGENT.has(alert),
      });
    }
  }
  const pending = rows.filter((row) => row.count > 0);

  return (
    <section aria-labelledby="pendientes" className="rounded-xl bg-card p-5 shadow-sm sm:p-6">
      <SectionTitle
        icon={<ListChecks className="size-5" aria-hidden />}
        title="Pendientes"
        titleId="pendientes"
        description="Lo que conviene resolver para vender y medir bien lo que se gasta."
      />

      {pending.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {pending.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex h-8 min-w-10 shrink-0 items-center justify-center rounded-full px-2.5 text-sm font-extrabold tabular-nums",
                    row.urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
                  )}
                >
                  {row.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{row.title}</span>
                  <span className="block text-sm text-muted-foreground">{row.hint}</span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <CircleCheck className="size-5 text-success" aria-hidden />
          Todo listo para vender y controlar.
        </p>
      )}
    </section>
  );
}
