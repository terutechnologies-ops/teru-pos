import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote } from "lucide-react";

import { CashMovementForm } from "@/components/pos/cash/cash-movement-form";
import { CashMovementList } from "@/components/pos/cash/cash-movement-list";
import { CashMovementTotalItems } from "@/components/pos/cash/cash-movement-totals";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getShiftCashMovements } from "@/server/services/cash-movements";

export const metadata: Metadata = { title: "Gastos y retiros" };

// Gastos, retiros e ingresos del turno abierto propio (también uno de otro
// día que aún no se cierra).
export default async function CashMovementsPage({ params }: PageProps<"/[empresa]/pos/caja">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "sales.charge");
  const data = await getShiftCashMovements(session);
  const slug = session.company.slug;
  if (!data.shift || !data.totals) redirect(`/${slug}/pos`);

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
          <h1 className="text-2xl font-extrabold tracking-tight">Gastos y retiros</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra el efectivo que sale o entra a la caja sin ser una venta. Cuenta en el cierre
            de tu turno.
          </p>
        </div>
        <CashMovementForm
          companySlug={slug}
          currency={data.currency}
          categories={data.categories}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">En este turno</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <CashMovementTotalItems totals={data.totals} currency={data.currency} />
        </dl>
        {data.movements.length > 0 ? (
          <CashMovementList
            movements={data.movements}
            currency={data.currency}
            timeZone={data.timeZone}
            companySlug={slug}
          />
        ) : (
          <EmptyState
            icon={Banknote}
            title="Sin movimientos"
            text="Aquí verás los gastos, retiros e ingresos que registres en este turno."
          />
        )}
      </section>
    </div>
  );
}
