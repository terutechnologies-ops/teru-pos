import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, LockOpen, Printer } from "lucide-react";

import { CashBreakdown } from "@/components/cash/cash-breakdown";
import { Item, ShiftSummary } from "@/components/pos/shift-summary";
import { PrintSheetButton } from "@/components/printing/print-sheet-button";
import { printSheetHref } from "@/components/printing/print-sheets";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { getClosedShift } from "@/server/services/cash-sessions";

export const metadata: Metadata = { title: "Turno cerrado" };

// Resumen de un turno cerrado, para quien lo cerró: aquí se ve por primera
// vez lo esperado y la diferencia (conteo ciego).
export default async function ClosedShiftPage({ params }: PageProps<"/[empresa]/pos/turno/[id]">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "sales.charge");
  const result = await getClosedShift(session, id);
  if (!result) notFound();
  const { shift, currency, dateFormat, timeZone } = result;
  const slug = session.company.slug;

  const difference = Number(shift.difference);
  const outcome =
    difference === 0
      ? { label: "Caja cuadrada", className: "text-success" }
      : difference < 0
        ? { label: "Faltante", className: "text-destructive" }
        : { label: "Sobrante", className: "text-primary" };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <section className="flex flex-col gap-6 rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-1 size-6 shrink-0 text-success" aria-hidden />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Turno cerrado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(shift.closedAt, dateFormat, timeZone)}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-muted p-5 text-center">
          <p className={cn("text-sm font-bold tracking-wide uppercase", outcome.className)}>
            {outcome.label}
          </p>
          <p className={cn("mt-1 text-4xl font-extrabold tabular-nums", outcome.className)}>
            {formatMoney(Math.abs(difference), currency)}
          </p>
        </div>

        <CashBreakdown
          openingAmount={shift.openingAmount}
          cash={shift.cash}
          expectedCash={shift.expectedCash}
          currency={currency}
        />
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Efectivo esperado" value={formatMoney(Number(shift.expectedCash), currency)} />
          <Item label="Efectivo contado" value={formatMoney(Number(shift.countedCash), currency)} />
        </dl>
        <ShiftSummary shift={shift} currency={currency} dateFormat={dateFormat} timeZone={timeZone} />
        {shift.closingNote && (
          <p className="rounded-lg bg-muted px-4 py-3 text-sm">
            <span className="font-semibold">Nota: </span>
            {shift.closingNote}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {result.printable && (
            <PrintSheetButton
              href={printSheetHref(slug, "cierre", shift.id, { auto: true })}
              variant="outline"
              size="lg"
              className="h-14 gap-2 text-base font-bold"
            >
              <Printer aria-hidden />
              Imprimir cierre
            </PrintSheetButton>
          )}
          <Button asChild size="lg" className="h-14 gap-2 text-base font-bold">
            <Link href={`/${slug}/pos`}>
              <LockOpen aria-hidden />
              Abrir un turno nuevo
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
