import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Boxes, CircleCheck, ClipboardCheck, Info, Printer, TriangleAlert } from "lucide-react";

import { COUNT_NOTICES } from "@/components/inventory/count-fields";
import { CountForm } from "@/components/inventory/count-form";
import { CountLines } from "@/components/inventory/count-lines";
import { stockSheetHref } from "@/components/printing/print-sheets";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getCount } from "@/server/services/inventory-counts";

export const metadata: Metadata = { title: "Inventario · Conteo" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function CountPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/inventario/conteos/[id]">) {
  const { empresa, id } = await params;
  const query = await searchParams;
  const notice = COUNT_NOTICES[param(query.aviso) as keyof typeof COUNT_NOTICES];

  const session = await requirePermission(empresa, "inventory.manage");
  const count = await getCount(session, id);
  if (!count) notFound();
  const slug = session.company.slug;
  const { draft } = count;
  const changed = count.lines.filter((line) => Number(line.difference) !== 0).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Inventario"
        title={count.number === null ? "Conteo en curso" : `Conteo #${count.number}`}
        description={
          <Badge variant={draft ? "outline" : "secondary"}>{draft ? "Borrador" : "Confirmado"}</Badge>
        }
      />

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ClipboardCheck className="size-5" aria-hidden />}
          title="Conteo"
          description="Qué bodega se cuenta y quién lo hizo."
          action={
            draft &&
            count.warehouse.isActive && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={stockSheetHref(slug, count.warehouse.id, { countId: count.id })}>
                  <Printer aria-hidden />
                  Imprimir hoja
                </Link>
              </Button>
            )
          }
        />
        <dl className="grid gap-4 sm:grid-cols-3">
          <Detail label="Bodega">{count.warehouse.label}</Detail>
          <Detail label="Empezó">
            {count.createdBy} · {count.createdAt}
          </Detail>
          {count.confirmedBy && (
            <Detail label="Confirmó">
              {count.confirmedBy} · {count.confirmedAt}
            </Detail>
          )}
        </dl>
      </section>

      {draft ? (
        <>
          {!count.warehouse.isActive && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                La bodega de este conteo está inactiva: actívala en Bodegas para confirmarlo, o
                elimina el borrador.
              </AlertDescription>
            </Alert>
          )}
          <Alert>
            <Info />
            <AlertDescription>
              El saldo del sistema se toma al confirmar: cuenta y confirma sin ventas en curso.
              {draft.openShifts > 0 &&
                ` Ahora hay ${
                  draft.openShifts === 1 ? "1 turno de caja abierto" : `${draft.openShifts} turnos de caja abiertos`
                } en esta sucursal: lo que se venda mientras cuentas cambia el saldo.`}{" "}
              Deja en blanco lo que no cuentes: no se ajusta.
            </AlertDescription>
          </Alert>
          {draft.rows.length > 0 ? (
            <CountForm
              companySlug={slug}
              countId={count.id}
              warehouseLabel={count.warehouse.label}
              draft={draft}
            />
          ) : (
            <EmptyState
              icon={Boxes}
              title="No tienes insumos activos"
              text="Crea tus insumos para poder contarlos."
              action={
                <Button asChild>
                  <Link href={`/${slug}/inventario/insumos/nuevo`}>Crear un insumo</Link>
                </Button>
              }
            />
          )}
        </>
      ) : (
        <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Boxes className="size-5" aria-hidden />}
            title="Insumos contados"
            description={`${count.lines.length} ${
              count.lines.length === 1 ? "insumo contado" : "insumos contados"
            }, ${changed === 1 ? "1 con diferencia" : `${changed} con diferencia`}. El sistema es el saldo al confirmar.`}
          />
          <CountLines lines={count.lines} companySlug={slug} />
        </section>
      )}
    </div>
  );
}
