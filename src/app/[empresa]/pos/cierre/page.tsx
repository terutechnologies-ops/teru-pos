import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CashMovementTotalItems } from "@/components/pos/cash/cash-movement-totals";
import { CloseShiftForm } from "@/components/pos/close-shift-form";
import { ShiftSummary } from "@/components/pos/shift-summary";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getShiftCashMovements } from "@/server/services/cash-movements";
import { getPosShift } from "@/server/services/cash-sessions";

export const metadata: Metadata = { title: "Cerrar turno" };

export default async function CloseShiftPage({ params }: PageProps<"/[empresa]/pos/cierre">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "sales.charge");
  const [pos, cash] = await Promise.all([getPosShift(session), getShiftCashMovements(session)]);
  const slug = session.company.slug;
  if (!pos.shift) redirect(`/${slug}/pos`);

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
          <h1 className="text-2xl font-extrabold tracking-tight">Cerrar turno</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuenta el efectivo de la caja y escribe el total.
          </p>
        </div>
        <ShiftSummary
          shift={pos.shift}
          currency={pos.currency}
          dateFormat={pos.dateFormat}
          timeZone={pos.timeZone}
        >
          {cash.totals && <CashMovementTotalItems totals={cash.totals} currency={pos.currency} />}
        </ShiftSummary>
        <CloseShiftForm companySlug={slug} currency={pos.currency} />
      </section>
    </div>
  );
}
