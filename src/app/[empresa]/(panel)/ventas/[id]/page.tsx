import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  ChefHat,
  CircleCheck,
  Lock,
  PackageMinus,
  PackagePlus,
  Printer,
  Receipt,
  Wallet,
} from "lucide-react";

import { printSheetHref } from "@/components/printing/print-sheets";
import { SectionTitle } from "@/components/shared/section-title";
import { PageHeader } from "@/components/shared/page-header";
import { SALE_NOTICES } from "@/components/sales/void-sale-fields";
import { VoidSaleForm } from "@/components/sales/void-sale-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import { requirePermission } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";
import { getSaleDetail, type SaleDetail } from "@/server/services/sales";

export const metadata: Metadata = { title: "Ventas · Detalle" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// Insumos que salieron (o volvieron) con la venta; enlazan a su ficha.
function InventoryList({
  items,
  companySlug,
  linkSupplies,
}: {
  items: SaleDetail["sale"]["consumed"];
  companySlug: string;
  linkSupplies: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
          <span className="min-w-0">
            {linkSupplies ? (
              <Link
                href={`/${companySlug}/inventario/insumos/${item.supplyId}`}
                className="font-semibold hover:underline"
              >
                {item.supplyName}
              </Link>
            ) : (
              <span className="font-semibold">{item.supplyName}</span>
            )}
            <span className="text-muted-foreground"> · {item.warehouseName}</span>
          </span>
          <span className="font-semibold tabular-nums">{formatQuantity(item.quantity, item.unit)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function SaleDetailPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/ventas/[id]">) {
  const { empresa, id } = await params;
  const query = await searchParams;
  const notice = SALE_NOTICES[param(query.aviso) as keyof typeof SALE_NOTICES];

  const session = await requirePermission(empresa, "sales.view");
  const detail = await getSaleDetail(session, id);
  if (!detail) notFound();

  const { sale, currency, dateFormat, timeZone } = detail;
  const slug = session.company.slug;
  const money = (value: string) => formatMoney(Number(value), currency);
  const when = (date: Date) => formatDateTime(date, dateFormat, timeZone);
  const role = session.user.role;
  const canVoid = detail.canVoid && hasPermission(role, "sales.void");
  const linkSupplies = hasPermission(role, "inventory.manage");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={`/${slug}/ventas`}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Ventas
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Ventas · Detalle"
          title={
            <span className="flex flex-wrap items-center gap-2">
              Venta #{sale.number}
              {sale.voided && <Badge variant="destructive">Anulada</Badge>}
            </span>
          }
          description={`${when(sale.createdAt)} · ${sale.branchName} · Cobró ${sale.cashierName}`}
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href={printSheetHref(slug, "soporte", sale.id)}>
              <Printer aria-hidden />
              Imprimir soporte
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href={printSheetHref(slug, "comanda", sale.id)}>
              <ChefHat aria-hidden />
              Reimprimir comanda
            </Link>
          </Button>
        </div>
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {sale.voided && (
        <Alert variant="destructive">
          <Ban />
          <AlertDescription>
            Anulada el {when(sale.voided.at)} por {sale.voided.byName}. Motivo: {sale.voided.reason}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Receipt className="size-5" aria-hidden />}
            title="Pedido"
            description="Productos con el precio que tenían al venderse."
          />
          <ul className="flex flex-col divide-y divide-border">
            {sale.lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="tabular-nums">{line.quantity}</span> × {line.productName}
                  </p>
                  {line.note && <p className="text-sm text-muted-foreground">Nota: {line.note}</p>}
                  {line.quantity > 1 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {money(line.unitPrice)} c/u
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{money(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t-2 border-border pt-3">
            <span className="font-bold">Total</span>
            <span className="text-xl font-extrabold tabular-nums">{money(sale.total)}</span>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
            <SectionTitle
              icon={<Wallet className="size-5" aria-hidden />}
              title="Pagos"
              description="Cómo se pagó."
            />
            <ul className="flex flex-col gap-2 text-sm">
              {sale.payments.map((payment) => (
                <li key={payment.id} className="flex flex-col">
                  <span className="flex justify-between gap-3">
                    <span className="font-semibold">{payment.methodName}</span>
                    <span className="font-semibold tabular-nums">{money(payment.amount)}</span>
                  </span>
                  {payment.tendered && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Recibido {money(payment.tendered)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {Number(sale.change) > 0 && (
              <p className="flex justify-between border-t border-border pt-2 text-sm">
                <span>Cambio</span>
                <span className="font-semibold tabular-nums">{money(sale.change)}</span>
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-sm sm:p-6">
            <SectionTitle
              icon={<Lock className="size-5" aria-hidden />}
              title="Turno de caja"
              description={`De ${sale.cashierName}, abierto el ${when(sale.shift.openedAt)}.`}
            />
            <p className="text-sm">
              {sale.shift.open ? (
                <Badge variant="secondary">Abierto</Badge>
              ) : (
                <Badge variant="outline">Cerrado</Badge>
              )}
            </p>
            {canVoid ? (
              <VoidSaleForm companySlug={slug} saleId={sale.id} saleNumber={sale.number} />
            ) : (
              !sale.voided &&
              !sale.shift.open && (
                <p className="text-sm text-muted-foreground">
                  El turno ya se cerró: esta venta no se puede anular.
                </p>
              )
            )}
          </section>
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<PackageMinus className="size-5" aria-hidden />}
          title="Inventario descontado"
          description="Lo que salió de la bodega según las recetas al momento de vender."
        />
        {sale.consumed.length > 0 ? (
          <InventoryList items={sale.consumed} companySlug={slug} linkSupplies={linkSupplies} />
        ) : (
          <p className="text-sm text-muted-foreground">Esta venta no descontó inventario.</p>
        )}

        {sale.returned.length > 0 && (
          <>
            <h3 className="mt-2 flex items-center gap-2 text-sm font-bold">
              <PackagePlus className="size-4" aria-hidden />
              Devuelto al anular
            </h3>
            <InventoryList items={sale.returned} companySlug={slug} linkSupplies={linkSupplies} />
          </>
        )}
      </section>
    </div>
  );
}
