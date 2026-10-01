import type { Metadata } from "next";
import Link from "next/link";
import { Lock, ShoppingBasket, TriangleAlert } from "lucide-react";

import { OpenShiftForm } from "@/components/pos/open-shift-form";
import { ShiftSummary } from "@/components/pos/shift-summary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { getPosShift } from "@/server/services/cash-sessions";

export const metadata: Metadata = { title: "Vender" };

// Sin turno: se abre. Con turno: aquí se vende (componente 4) y desde aquí
// se cierra.
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {pos.stale && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Tu turno está abierto desde el{" "}
            {formatDateTime(pos.shift.openedAt, pos.dateFormat, pos.timeZone)}. Ciérralo y abre
            uno nuevo para que las ventas de hoy queden en el turno de hoy.
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-primary uppercase">
              Turno abierto
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight">Tu caja</h1>
          </div>
          <Button asChild variant={pos.stale ? "default" : "outline"} className="h-11 gap-2">
            <Link href={`/${slug}/pos/cierre`}>
              <Lock aria-hidden />
              Cerrar turno
            </Link>
          </Button>
        </div>
        <ShiftSummary
          shift={pos.shift}
          currency={pos.currency}
          dateFormat={pos.dateFormat}
          timeZone={pos.timeZone}
        />
      </section>

      {!pos.stale && (
        <section className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <ShoppingBasket className="size-10 text-muted-foreground" aria-hidden />
          <p className="font-bold">Aquí armarás y cobrarás cada pedido</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            La pantalla de venta llega en la siguiente entrega. Por ahora puedes abrir y cerrar tu
            turno.
          </p>
        </section>
      )}
    </div>
  );
}
