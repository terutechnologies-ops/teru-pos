import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintFrame } from "@/components/printing/print-frame";
import { ShiftClosingSheet } from "@/components/printing/shift-closing-sheet";
import { getPrintableShift } from "@/server/services/cash-sessions";

import { requirePrintAccess } from "../../print-access";

export const metadata: Metadata = { title: "Cierre de turno" };

export default async function ShiftClosingPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/imprimir/cierre/[id]">) {
  const { empresa, id } = await params;
  const { auto } = await searchParams;
  const { session, backHref } = await requirePrintAccess(empresa, "cash.review", {
    panel: `caja/${id}`,
    pos: `pos/turno/${id}`,
  });
  const printable = await getPrintableShift(session, id);
  if (!printable) notFound();

  return (
    <PrintFrame backHref={backHref} auto={auto === "1"}>
      <ShiftClosingSheet printable={printable} />
    </PrintFrame>
  );
}
