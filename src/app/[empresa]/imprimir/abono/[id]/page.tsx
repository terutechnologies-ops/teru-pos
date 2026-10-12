import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerPaymentReceipt } from "@/components/printing/customer-payment-receipt";
import { PrintFrame } from "@/components/printing/print-frame";
import { hasPermission } from "@/server/services/auth/permissions";
import { getPrintableCustomerPayment } from "@/server/services/customer-payments";

import { requirePrintAccess } from "../../print-access";

export const metadata: Metadata = { title: "Comprobante de abono" };

export default async function CustomerPaymentReceiptPage({
  params,
  searchParams,
}: PageProps<"/[empresa]/imprimir/abono/[id]">) {
  const { empresa, id } = await params;
  const { auto } = await searchParams;
  const { session, backHref } = await requirePrintAccess(empresa, "cash.review", {
    panel: "caja",
    pos: "pos/abonos",
  });
  const printable = await getPrintableCustomerPayment(session, id);
  if (!printable) notFound();
  // En el panel, "Volver" lleva al turno del abono.
  const back = hasPermission(session.user.role, "cash.review")
    ? `/${session.company.slug}/caja/${printable.payment.cashSessionId}`
    : backHref;

  return (
    <PrintFrame backHref={back} auto={auto === "1"}>
      <CustomerPaymentReceipt printable={printable} />
    </PrintFrame>
  );
}
