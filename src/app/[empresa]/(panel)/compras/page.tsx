import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Plus } from "lucide-react";

import { PURCHASE_LIST_NOTICES } from "@/components/purchases/purchase-fields";
import { PurchaseDraftList } from "@/components/purchases/purchase-draft-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";
import { getPurchaseDrafts } from "@/server/services/purchases";

export const metadata: Metadata = { title: "Compras" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function PurchasesPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/compras">) {
  const { empresa } = await params;
  const query = await searchParams;
  const notice = PURCHASE_LIST_NOTICES[param(query.aviso) as keyof typeof PURCHASE_LIST_NOTICES];

  const session = await requirePermission(empresa, "purchases.manage");
  const { currency, drafts } = await getPurchaseDrafts(session);
  const base = `/${session.company.slug}/compras`;
  const newButton = (
    <Button asChild className="h-11 gap-2 px-5">
      <Link href={`${base}/nueva`}>
        <Plus aria-hidden />
        Nueva compra
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Compras"
          title="Compras"
          description="Lo que compras entra al inventario con su costo real al confirmar la compra."
        />
        {newButton}
      </div>

      {notice && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
        <h2 id="drafts-title" className="text-lg font-bold">
          Borradores
        </h2>
        {drafts.length > 0 ? (
          <PurchaseDraftList
            drafts={drafts}
            currency={currency}
            companySlug={session.company.slug}
          />
        ) : (
          <EmptyState
            title="No hay compras en borrador"
            text="Registra una compra con los datos de la factura y sus insumos; al confirmarla entra a la bodega y actualiza el costo."
            action={newButton}
          />
        )}
      </section>
    </div>
  );
}
