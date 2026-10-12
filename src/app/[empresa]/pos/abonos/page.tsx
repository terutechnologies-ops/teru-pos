import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, HandCoins, Printer } from "lucide-react";

import { CustomerPaymentList } from "@/components/cash/customer-payment-list";
import { CustomerPaymentForm } from "@/components/pos/payments/customer-payment-form";
import { printSheetHref } from "@/components/printing/print-sheets";
import { PrintSheetButton } from "@/components/printing/print-sheet-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { getShiftCustomerPayments } from "@/server/services/customer-payments";

export const metadata: Metadata = { title: "Abonos" };

// Abonos de clientes de crédito en el turno abierto propio (también uno de
// otro día que aún no se cierra).
export default async function CustomerPaymentsPage({ params }: PageProps<"/[empresa]/pos/abonos">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "sales.charge");
  const data = await getShiftCustomerPayments(session);
  const slug = session.company.slug;
  if (!data.shift || !data.totals) redirect(`/${slug}/pos`);
  const money = (value: string) => formatMoney(Number(value), data.currency);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="gap-2 self-start">
        <Link href={`/${slug}/pos`}>
          <ArrowLeft aria-hidden />
          Volver a vender
        </Link>
      </Button>

      <section className="flex flex-col gap-6 rounded-2xl bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Abonos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recibe pagos de clientes que compraron a crédito. Los abonos en efectivo cuentan en el
            cierre de tu turno.
          </p>
        </div>
        <CustomerPaymentForm companySlug={slug} currency={data.currency} methods={data.methods} />
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">En este turno</h2>
          {data.totals.count > 0 && (
            <p className="text-sm text-muted-foreground">
              {data.totals.count === 1 ? "1 abono" : `${data.totals.count} abonos`} por{" "}
              <span className="font-bold text-foreground">{money(data.totals.total)}</span> · en
              efectivo {money(data.totals.cash)}
            </p>
          )}
        </div>
        {data.payments.length > 0 ? (
          <CustomerPaymentList
            payments={data.payments}
            currency={data.currency}
            timeZone={data.timeZone}
            renderActions={(payment) =>
              !payment.voided && (
                <PrintSheetButton
                  href={printSheetHref(slug, "abono", payment.id, { auto: true })}
                  variant="link"
                  className="h-auto w-fit gap-1 p-0 text-sm"
                >
                  <Printer className="size-4" aria-hidden />
                  Imprimir comprobante
                </PrintSheetButton>
              )
            }
          />
        ) : (
          <EmptyState
            icon={HandCoins}
            title="Sin abonos"
            text="Aquí verás los abonos que recibas en este turno."
          />
        )}
      </section>
    </div>
  );
}
