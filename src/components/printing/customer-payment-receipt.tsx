import {
  formatCalendarDate,
  formatClock,
  formatDateTime,
  formatMoney,
} from "@/lib/company-formats";
import type { PrintableCustomerPayment } from "@/server/services/customer-payments";

import {
  CompanyHeader,
  DashedRule,
  SheetRow,
  ThickRule,
  VoidedMark,
  taxIdText,
} from "./sheet-parts";

// Comprobante de un abono para el cliente de crédito, si lo pide. El saldo
// es el que quedó al registrarlo (no cambia al reimprimir).
export function CustomerPaymentReceipt({ printable }: { printable: PrintableCustomerPayment }) {
  const { company, payment, currency, dateFormat, timeZone } = printable;
  const money = (value: string) => formatMoney(Number(value), currency);
  const settled = Number(payment.balanceAfter) === 0;

  return (
    <article>
      <CompanyHeader company={company} />

      <DashedRule />
      <p className="text-center font-bold tracking-[0.08em]">COMPROBANTE DE ABONO</p>
      {payment.voided && <VoidedMark label="ANULADO" />}
      <div className="mt-[0.3em]">
        <SheetRow label="Abono" value={<strong>#{payment.number}</strong>} />
        <SheetRow
          label="Fecha"
          value={formatDateTime(payment.createdAt, dateFormat, timeZone)}
          className="group-data-[paper=58]/sheet:hidden"
        />
        <SheetRow
          label={formatCalendarDate(payment.createdAt, dateFormat, timeZone)}
          value={formatClock(payment.createdAt, timeZone)}
          className="hidden group-data-[paper=58]/sheet:flex"
        />
        <SheetRow label="Recibió" value={payment.userName} />
        <SheetRow
          label="Cliente"
          value={
            payment.customerTaxId
              ? `${payment.customerName} (${taxIdText(payment.customerTaxId)})`
              : payment.customerName
          }
        />
      </div>

      <ThickRule />
      <SheetRow
        label="ABONO"
        value={money(payment.amount)}
        className="text-[2em] leading-tight font-extrabold group-data-[paper=58]/sheet:text-[1.55em]"
      />

      <DashedRule />
      <div>
        <SheetRow label="Forma de pago" value={payment.methodName} />
        {payment.tendered && (
          <SheetRow label="Recibido" value={money(payment.tendered)} className="pl-[0.6em] text-[0.85em]" />
        )}
        {Number(payment.change) > 0 && (
          <SheetRow label="Cambio" value={money(payment.change)} className="font-bold" />
        )}
      </div>

      <DashedRule />
      <SheetRow
        label="Saldo pendiente"
        value={money(payment.balanceAfter)}
        className="text-[1.2em] font-extrabold"
      />
      {settled && <p className="mt-[0.2em] text-center font-bold">A PAZ Y SALVO</p>}

      <DashedRule />
      <p className="mt-[0.4em] text-center font-bold">¡Gracias por tu pago!</p>
      <p className="mt-[0.4em] text-center text-[0.85em]">
        Este comprobante no es una factura electrónica.
      </p>
    </article>
  );
}
