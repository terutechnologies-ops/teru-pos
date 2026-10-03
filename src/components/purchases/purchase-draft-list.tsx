import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { formatMoney } from "@/lib/company-formats";
import type { PurchaseDraftRow } from "@/server/services/purchases";

// Borradores, el más reciente primero. Toda la fila abre el borrador.
export function PurchaseDraftList({
  drafts,
  currency,
  companySlug,
}: {
  drafts: PurchaseDraftRow[];
  currency: string;
  companySlug: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {drafts.map((draft) => (
        <li key={draft.id}>
          <Link
            href={`/${companySlug}/compras/${draft.id}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 sm:px-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-bold">{draft.supplierName}</span>
              <span className="truncate text-sm text-muted-foreground">
                {draft.purchasedOn}
                {draft.supplierInvoice && ` · Factura ${draft.supplierInvoice}`} ·{" "}
                {draft.warehouseName} ·{" "}
                {draft.lineCount === 1 ? "1 insumo" : `${draft.lineCount} insumos`}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Lo creó {draft.createdBy} el {draft.createdAt}
              </span>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatMoney(Number(draft.total), currency)}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
