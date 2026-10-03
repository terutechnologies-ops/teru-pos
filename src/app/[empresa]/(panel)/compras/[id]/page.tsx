import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Ban, Boxes, CircleCheck, FileText, Info, TriangleAlert, Warehouse } from "lucide-react";

import { AddPurchaseLineForm } from "@/components/purchases/add-purchase-line-form";
import {
  ConfirmPurchaseForm,
  DeletePurchaseDraftForm,
} from "@/components/purchases/purchase-draft-actions";
import { PURCHASE_NOTICES } from "@/components/purchases/purchase-fields";
import { EditPurchaseHeaderForm } from "@/components/purchases/purchase-header-form";
import { PurchaseInventory } from "@/components/purchases/purchase-inventory";
import { PurchaseLines } from "@/components/purchases/purchase-lines";
import { VoidPurchaseForm } from "@/components/purchases/void-purchase-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/company-formats";
import { requirePermission } from "@/server/http/staff-session";
import { getPurchase, type PurchaseDetail } from "@/server/services/purchases";

export const metadata: Metadata = { title: "Compras · Compra" };

const STATUS_BADGES: Record<PurchaseDetail["status"], { label: string; variant: "outline" | "secondary" | "destructive" }> = {
  DRAFT: { label: "Borrador", variant: "outline" },
  CONFIRMED: { label: "Confirmada", variant: "secondary" },
  VOIDED: { label: "Anulada", variant: "destructive" },
};

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

export default async function PurchasePage({
  params,
  searchParams,
}: PageProps<"/[empresa]/compras/[id]">) {
  const { empresa, id } = await params;
  const query = await searchParams;
  const notice = PURCHASE_NOTICES[param(query.aviso) as keyof typeof PURCHASE_NOTICES];

  const session = await requirePermission(empresa, "purchases.manage");
  const purchase = await getPurchase(session, id);
  if (!purchase) notFound();
  const slug = session.company.slug;
  const { draft } = purchase;
  const badge = STATUS_BADGES[purchase.status];
  const warehouseLabel = draft?.options.showBranch
    ? `${purchase.warehouse.branchName} · ${purchase.warehouse.name}`
    : purchase.warehouse.name;
  const hasUninitialized = purchase.lines.some((line) => line.supply.uninitialized);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Compras"
        title={purchase.number === null ? "Compra en borrador" : `Compra #${purchase.number}`}
        description={<Badge variant={badge.variant}>{badge.label}</Badge>}
      />

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {purchase.voided && (
        <Alert variant="destructive">
          <Ban />
          <AlertDescription>
            Anulada por {purchase.voided.byName} el {purchase.voided.at}. Motivo:{" "}
            {purchase.voided.reason}
          </AlertDescription>
        </Alert>
      )}

      {draft && purchase.supplier.isArchived && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            El proveedor de este borrador está archivado: cámbialo o restáuralo antes de guardar
            cambios en los datos de la factura.
          </AlertDescription>
        </Alert>
      )}
      {draft && !purchase.warehouse.isActive && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            La bodega de este borrador está inactiva: cámbiala para poder confirmar la compra.
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<FileText className="size-5" aria-hidden />}
          title="Factura"
          description="De quién es la compra, a dónde entra y de qué día."
        />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Proveedor">
            <span className="font-semibold">{purchase.supplier.name}</span>
            {purchase.supplier.taxId && (
              <span className="text-muted-foreground"> · NIT {purchase.supplier.taxId}</span>
            )}
          </Detail>
          <Detail label="Bodega">{warehouseLabel}</Detail>
          <Detail label="Fecha de la compra">{purchase.purchasedOn}</Detail>
          <Detail label="Factura o remisión">{purchase.supplierInvoice ?? "—"}</Detail>
          <Detail label="Creó">
            {purchase.createdBy} · {purchase.createdAt}
          </Detail>
          {purchase.confirmedBy && (
            <Detail label="Confirmó">
              {purchase.confirmedBy} · {purchase.confirmedAt}
            </Detail>
          )}
        </dl>
        {draft && (
          <EditPurchaseHeaderForm
            key={`${purchase.supplier.id}-${purchase.warehouse.id}-${purchase.purchasedOnDay}-${purchase.supplierInvoice}`}
            companySlug={slug}
            purchaseId={purchase.id}
            options={draft.options}
            initialValues={{
              supplierId: purchase.supplier.id,
              warehouseId: purchase.warehouse.id,
              purchasedOn: purchase.purchasedOnDay,
              supplierInvoice: purchase.supplierInvoice ?? "",
            }}
          />
        )}
      </section>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Boxes className="size-5" aria-hidden />}
          title="Insumos"
          description="Cantidad comprada y lo que se pagó por ella, con impuestos. El costo es por unidad del insumo."
        />

        {purchase.lines.length > 0 ? (
          <PurchaseLines purchase={purchase} companySlug={slug} />
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay insumos en esta compra.</p>
        )}

        {draft && hasUninitialized && (
          <Alert>
            <Info />
            <AlertDescription>
              Los insumos marcados &quot;Sin carga inicial&quot; no tienen existencia registrada: la
              compra se sumará a una cantidad que el sistema no conoce. Revisa su existencia
              después de confirmar.
            </AlertDescription>
          </Alert>
        )}

        {draft &&
          (draft.availableSupplies.length > 0 ? (
            <div className="border-t border-border pt-4">
              <AddPurchaseLineForm
                key={purchase.lines.map((line) => line.id).join("-")}
                companySlug={slug}
                purchaseId={purchase.id}
                currency={purchase.currency}
                supplies={draft.availableSupplies}
              />
            </div>
          ) : (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              {draft.hasSupplies ? (
                "Todos tus insumos activos ya están en esta compra."
              ) : (
                <>
                  No tienes insumos activos.{" "}
                  {purchase.canViewSupplies && (
                    <Link
                      href={`/${slug}/inventario/insumos/nuevo`}
                      className="font-semibold text-link hover:underline"
                    >
                      Crear un insumo
                    </Link>
                  )}
                </>
              )}
            </p>
          ))}

        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <span className="font-semibold">Total de la compra</span>
          <span className="text-xl font-bold tabular-nums">
            {formatMoney(Number(purchase.total), purchase.currency)}
          </span>
        </div>
      </section>

      {!draft && (
        <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Warehouse className="size-5" aria-hidden />}
            title="Inventario"
            description="Lo que la compra movió en la bodega, en la unidad de cada insumo."
          />
          <PurchaseInventory purchase={purchase} companySlug={slug} />
        </section>
      )}

      {purchase.status === "CONFIRMED" && purchase.number !== null && (
        <VoidPurchaseForm
          companySlug={slug}
          purchaseId={purchase.id}
          purchaseNumber={purchase.number}
        />
      )}

      {draft && (
        <div className="flex flex-row-reverse flex-wrap items-start gap-3">
          <ConfirmPurchaseForm
            companySlug={slug}
            purchaseId={purchase.id}
            warehouseName={warehouseLabel}
          />
          <DeletePurchaseDraftForm companySlug={slug} purchaseId={purchase.id} />
        </div>
      )}
    </div>
  );
}
