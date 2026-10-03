import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calculator,
  CircleCheck,
  Printer,
  Receipt,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { CashDifference } from "@/components/cash/cash-difference";
import { CASH_NOTICES } from "@/components/cash/close-others-shift-fields";
import { CloseOthersShiftForm } from "@/components/cash/close-others-shift-form";
import { printSheetHref } from "@/components/printing/print-sheets";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatClock, formatDateTime, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { hasPermission } from "@/server/services/auth/permissions";
import { getCashSessionReview } from "@/server/services/cash-sessions";

export const metadata: Metadata = { title: "Cierres de caja · Turno" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// Detalle del turno: cuadre (o cómo va, si está abierto), ventas por método
// de pago y la lista de ventas. Un turno abierto se puede cerrar aquí.
export default async function CashSessionPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/caja/[id]">) {
  const { empresa, id } = await params;
  const query = await searchParams;
  const notice = CASH_NOTICES[param(query.aviso) as keyof typeof CASH_NOTICES];

  const session = await requirePermission(empresa, "cash.review");
  const review = await getCashSessionReview(session, id);
  if (!review) notFound();

  const { shift, currency, dateFormat, timeZone } = review;
  const slug = session.company.slug;
  const money = (value: string) => formatMoney(Number(value), currency);
  const when = (date: Date) => formatDateTime(date, dateFormat, timeZone);
  const canSeeSales = hasPermission(session.user.role, "sales.view");
  const expected = shift.closed?.expectedCash ?? shift.liveExpected ?? "0";
  const voidedCount = shift.sales.filter((sale) => sale.voided).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={`/${slug}/caja`}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Cierres de caja
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Cierres de caja · Turno"
          title={
            <span className="flex flex-wrap items-center gap-2">
              Turno de {shift.cashierName}
              {shift.closed ? (
                <Badge variant="outline">Cerrado</Badge>
              ) : (
                <Badge variant="secondary">Abierto</Badge>
              )}
            </span>
          }
          description={`${shift.branchName} · Abierto el ${when(shift.openedAt)}${
            shift.closed ? ` · Cerrado el ${when(shift.closed.at)}` : ""
          }`}
        />
        {shift.closed && (
          <Button asChild variant="outline" className="gap-2">
            <Link href={printSheetHref(slug, "cierre", shift.id)}>
              <Printer aria-hidden />
              Imprimir cierre
            </Link>
          </Button>
        )}
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {shift.closed?.byOtherName && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            Lo cerró {shift.closed.byOtherName}, no su cajero.
            {shift.closed.note && ` Motivo: ${shift.closed.note}`}
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Calculator className="size-5" aria-hidden />}
          title={shift.closed ? "Cuadre" : "Cómo va"}
          description={
            shift.closed
              ? "Efectivo que debería haber al cerrar y el que se contó."
              : "Efectivo que debería haber hasta ahora. El cajero no lo ve hasta cerrar (conteo ciego)."
          }
        />
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt>Fondo inicial</dt>
            <dd className="tabular-nums">{money(shift.openingAmount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>+ Efectivo de ventas no anuladas</dt>
            <dd className="tabular-nums">{money(shift.cashSales)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-bold">
            <dt>Esperado</dt>
            <dd className="tabular-nums">{money(expected)}</dd>
          </div>
          {shift.closed && (
            <>
              <div className="flex justify-between gap-3 font-bold">
                <dt>Contado</dt>
                <dd className="tabular-nums">{money(shift.closed.countedCash)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t-2 border-border pt-2">
                <dt className="font-bold">Diferencia</dt>
                <dd>
                  <CashDifference
                    difference={shift.closed.difference}
                    currency={currency}
                    className="text-lg"
                  />
                </dd>
              </div>
              {shift.closed.note && !shift.closed.byOtherName && (
                <p className="text-muted-foreground">Nota del cierre: {shift.closed.note}</p>
              )}
            </>
          )}
        </dl>
        {review.canClose && (
          <CloseOthersShiftForm
            companySlug={slug}
            cashSessionId={shift.id}
            cashierName={shift.cashierName}
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Wallet className="size-5" aria-hidden />}
            title="Por método de pago"
            description="Ventas no anuladas del turno."
          />
          {shift.byMethod.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {shift.byMethod.map((method) => (
                <li key={method.name} className="flex justify-between gap-3">
                  <span>{method.name}</span>
                  <span className="font-semibold tabular-nums">{money(method.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin ventas.</p>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Receipt className="size-5" aria-hidden />}
            title="Ventas del turno"
            description={`${shift.salesCount} no anuladas${
              voidedCount > 0 ? ` · ${voidedCount} anuladas` : ""
            }.`}
          />
          {shift.sales.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {shift.sales.map((sale) => {
                const label = (
                  <>
                    <span className="font-semibold tabular-nums">#{sale.number}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {" "}
                      · {formatClock(sale.createdAt, timeZone)}
                    </span>
                    {sale.voided && (
                      <Badge variant="destructive" className="ml-2">
                        Anulada
                      </Badge>
                    )}
                  </>
                );
                return (
                  <li key={sale.id} className="flex items-center justify-between gap-3 py-2">
                    {canSeeSales ? (
                      <Link href={`/${slug}/ventas/${sale.id}`} className="hover:underline">
                        {label}
                      </Link>
                    ) : (
                      <span>{label}</span>
                    )}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        sale.voided && "text-muted-foreground line-through",
                      )}
                    >
                      {money(sale.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Este turno no tiene ventas.</p>
          )}
        </section>
      </div>
    </div>
  );
}
