import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Lock, TriangleAlert } from "lucide-react";

import { OpenShiftForm } from "@/components/pos/open-shift-form";
import { PrintSettingsButton } from "@/components/pos/print-settings-button";
import { cartStorageKey } from "@/components/pos/sale/cart-storage";
import { PosRegister } from "@/components/pos/sale/pos-register";
import { ShiftSummary } from "@/components/pos/shift-summary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatClock, formatDateTime } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { getPosShift } from "@/server/services/cash-sessions";
import { getPosCatalog } from "@/server/services/sales";

export const metadata: Metadata = { title: "Vender" };

// Sin turno: se abre. Con turno de hoy: se vende. Con turno de otro día: se
// pide cerrarlo antes de seguir.
export default async function PosPage({ params }: PageProps<"/[empresa]/pos">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "sales.charge");
  const pos = await getPosShift(session);
  const slug = session.company.slug;

  if (!pos.shift) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Abre tu turno</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Para vender necesitas un turno de caja abierto. Lo cierras al terminar, contando el
            efectivo.
          </p>
        </div>
        <OpenShiftForm companySlug={slug} currency={pos.currency} branches={pos.branches} />
      </section>
    );
  }

  const closeButton = (
    <Button asChild variant={pos.stale ? "default" : "outline"} className="h-11 gap-2">
      <Link href={`/${slug}/pos/cierre`}>
        <Lock aria-hidden />
        Cerrar turno
      </Link>
    </Button>
  );

  const cashButton = (
    <Button asChild variant="outline" className="h-11 gap-2">
      <Link href={`/${slug}/pos/caja`}>
        <Banknote aria-hidden />
        Gastos y retiros
      </Link>
    </Button>
  );

  if (pos.stale) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Tu turno está abierto desde el{" "}
            {formatDateTime(pos.shift.openedAt, pos.dateFormat, pos.timeZone)}. Ciérralo y abre
            uno nuevo para que las ventas de hoy queden en el turno de hoy.
          </AlertDescription>
        </Alert>
        <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">Tu caja</h1>
            <div className="flex flex-wrap gap-2">
              {cashButton}
              {closeButton}
            </div>
          </div>
          <ShiftSummary
            shift={pos.shift}
            currency={pos.currency}
            dateFormat={pos.dateFormat}
            timeZone={pos.timeZone}
          />
        </section>
      </div>
    );
  }

  const catalog = await getPosCatalog(session);
  const { shift } = pos;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-primary">Turno abierto</span> · {shift.branchName} ·
          desde {formatClock(shift.openedAt, pos.timeZone)} ·{" "}
          {shift.salesCount === 1 ? "1 venta" : `${shift.salesCount} ventas`}
        </p>
        <div className="flex flex-wrap gap-2">
          <PrintSettingsButton />
          {cashButton}
          {closeButton}
        </div>
      </div>
      <PosRegister
        companySlug={slug}
        catalog={catalog}
        storageKey={cartStorageKey(slug, session.user.id, shift.id)}
      />
    </div>
  );
}
