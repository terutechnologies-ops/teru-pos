import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintFrame } from "@/components/printing/print-frame";
import { StockCountSheet } from "@/components/printing/stock-count-sheet";
import { requirePermission } from "@/server/http/staff-session";
import { getStockSheet } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Existencias" };

// Se llega desde Bodegas o desde Insumos (?desde=insumos); "Volver" regresa allí.
export default async function StockSheetPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/imprimir/existencias/[id]">) {
  const { empresa, id } = await params;
  const { desde } = await searchParams;
  const session = await requirePermission(empresa, "inventory.manage");
  const sheet = await getStockSheet(session, id);
  if (!sheet) notFound();
  const back = desde === "insumos" ? "insumos" : "bodegas";

  return (
    <PrintFrame backHref={`/${session.company.slug}/inventario/${back}`} auto={false} allowLetter>
      <StockCountSheet sheet={sheet} />
    </PrintFrame>
  );
}
