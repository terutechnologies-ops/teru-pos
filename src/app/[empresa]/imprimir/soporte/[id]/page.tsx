import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintFrame } from "@/components/printing/print-frame";
import { SaleReceipt } from "@/components/printing/sale-receipt";
import { getPrintableSale } from "@/server/services/sales";

import { requirePrintAccess } from "../../print-access";

export const metadata: Metadata = { title: "Soporte de venta" };

export default async function SaleReceiptPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/imprimir/soporte/[id]">) {
  const { empresa, id } = await params;
  const { auto } = await searchParams;
  const { session, backHref } = await requirePrintAccess(empresa, "sales.view", {
    panel: `ventas/${id}`,
    pos: "pos",
  });
  const printable = await getPrintableSale(session, id);
  if (!printable) notFound();

  return (
    <PrintFrame backHref={backHref} auto={auto === "1"}>
      <SaleReceipt printable={printable} />
    </PrintFrame>
  );
}
