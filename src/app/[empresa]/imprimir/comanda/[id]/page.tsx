import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KitchenTicket } from "@/components/printing/kitchen-ticket";
import { PrintFrame } from "@/components/printing/print-frame";
import { getPrintableSale } from "@/server/services/sales";

import { requirePrintAccess } from "../../print-access";

export const metadata: Metadata = { title: "Comanda" };

export default async function KitchenTicketPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/imprimir/comanda/[id]">) {
  const { empresa, id } = await params;
  const { auto } = await searchParams;
  const { session, backHref } = await requirePrintAccess(empresa, id);
  const printable = await getPrintableSale(session, id);
  if (!printable) notFound();

  return (
    <PrintFrame backHref={backHref} auto={auto === "1"}>
      <KitchenTicket printable={printable} />
    </PrintFrame>
  );
}
