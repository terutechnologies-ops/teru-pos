import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { CountDraftRow } from "@/server/services/inventory-counts";

// Conteos en curso, el más reciente primero. Toda la fila abre el borrador.
export function CountDraftList({
  drafts,
  companySlug,
}: {
  drafts: CountDraftRow[];
  companySlug: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-sm">
      {drafts.map((draft) => (
        <li key={draft.id}>
          <Link
            href={`/${companySlug}/inventario/conteos/${draft.id}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 sm:px-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-bold">{draft.warehouseName}</span>
              <span className="truncate text-sm text-muted-foreground">
                {draft.countedCount === 0
                  ? "Aún sin insumos contados"
                  : draft.countedCount === 1
                    ? "1 insumo contado"
                    : `${draft.countedCount} insumos contados`}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Lo empezó {draft.createdBy} el {draft.createdAt}
              </span>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
