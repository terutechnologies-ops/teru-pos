import "server-only";

import { PLATFORM_NAME } from "@/lib/brand";
import {
  addCalendarDays,
  calendarDay,
  formatDate,
  formatDateTime,
  formatMoney,
  type DateFormat,
} from "@/lib/company-formats";
import { findCompanyFormats, findCompanySettings } from "@/server/data/companies";
import { findSaleDetail } from "@/server/data/sales";
import { publicFileUrl } from "@/server/services/images";
import { getMessageSender } from "@/server/services/messaging";
import {
  amountTable,
  bodyRow,
  card,
  EMAIL_COLORS as C,
  emailLayout,
  escapeHtml,
  sectionTitle,
} from "@/server/services/messaging/email-layout";

// Constancia de una compra a crédito para el cliente: qué llevó, cuánto se
// cargó a su cuenta, el número de la venta y hasta cuándo tiene para pagar.
// Solo clientes de crédito con correo (no hay factura electrónica que cumpla
// ese papel). Se envía después de cobrar y nunca lanza: un fallo del correo
// no afecta la venta.

type Decimalish = { toString(): string };

export type CreditSaleEmailInput = {
  companyName: string;
  companyPhone: string | null;
  logoUrl: string | null;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  customerName: string;
  creditDays: number;
  sale: {
    number: number;
    createdAt: Date;
    total: Decimalish;
    lines: { productName: string; quantity: number; lineTotal: Decimalish }[];
    payments: { methodName: string; amount: Decimalish; isCredit: boolean }[];
  };
};

// Fecha límite: el día de la venta (en la zona de la empresa) + el plazo.
function dueDate({ sale, creditDays, dateFormat, timeZone }: CreditSaleEmailInput) {
  const day = addCalendarDays(calendarDay(sale.createdAt, timeZone), creditDays);
  return formatDate(new Date(`${day}T00:00:00Z`), dateFormat);
}

export function buildCreditSaleEmail(input: CreditSaleEmailInput) {
  const { sale, companyName, customerName, currency } = input;
  const money = (value: Decimalish) => formatMoney(Number(value.toString()), currency);
  const onCredit = sale.payments
    .filter((payment) => payment.isCredit)
    .reduce((sum, payment) => sum + Number(payment.amount.toString()), 0);
  const otherPayments = sale.payments.filter((payment) => !payment.isCredit);
  const when = formatDateTime(sale.createdAt, input.dateFormat, input.timeZone);
  const due = dueDate(input);
  const contact = input.companyPhone
    ? `Si no reconoces esta compra, comunícate con ${companyName} al ${input.companyPhone}.`
    : `Si no reconoces esta compra, comunícate con ${companyName}.`;

  const subject = `Compra a crédito en ${companyName} · Venta #${sale.number} · ${formatMoney(onCredit, currency)}`;
  const intro = `Registramos una compra a crédito a tu nombre en ${companyName}. Te enviamos el detalle para que tengas constancia.`;

  const text = [
    `Hola ${customerName},`,
    "",
    intro,
    "",
    `Venta #${sale.number} · ${when}`,
    "",
    "PEDIDO",
    ...sale.lines.map((line) => `• ${line.quantity} × ${line.productName}: ${money(line.lineTotal)}`),
    `Total: ${money(sale.total)}`,
    "",
    `Cargado a tu cuenta: ${formatMoney(onCredit, currency)}`,
    ...otherPayments.map((payment) => `Pagado con ${payment.methodName}: ${money(payment.amount)}`),
    `Fecha límite de pago: ${due}`,
    "",
    contact,
    "",
    `Correo automático de ${PLATFORM_NAME} para ${companyName}. No respondas a este mensaje.`,
  ].join("\n");

  const lineRows = sale.lines.map((line) => ({
    label: `${line.quantity} × ${line.productName}`,
    value: money(line.lineTotal),
  }));
  const paymentRows = [
    { label: "Cargado a tu cuenta", value: formatMoney(onCredit, currency), strong: true },
    ...otherPayments.map((payment) => ({
      label: `Pagado con ${payment.methodName}`,
      value: money(payment.amount),
    })),
    { label: "Fecha límite de pago", value: due },
  ];

  const body = [
    bodyRow(
      card(
        `<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:${C.text}">${escapeHtml(`Hola ${customerName},`)}</p>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.text}">${escapeHtml(intro)}</p>`,
        "24px 24px",
      ),
    ),
    bodyRow(
      sectionTitle("Pedido") +
        card(
          amountTable(lineRows) +
            `<div style="margin-top:8px;border-top:2px solid ${C.border}"></div>` +
            amountTable([{ label: "Total", value: money(sale.total), strong: true }]),
        ),
    ),
    bodyRow(sectionTitle("Tu crédito") + card(amountTable(paymentRows))),
    bodyRow(
      `<p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted}">${escapeHtml(contact)}</p>`,
      "18px 28px 28px",
    ),
  ].join("\n");

  const html = emailLayout({
    title: subject,
    preheader: `Venta #${sale.number}: ${formatMoney(onCredit, currency)} cargados a tu cuenta. Fecha límite de pago: ${due}.`,
    header: {
      companyName,
      logoUrl: input.logoUrl,
      eyebrow: "Compra a crédito",
      chips: [`Venta #${sale.number}`, when],
    },
    body,
    footer: [`Correo automático de ${PLATFORM_NAME} para ${companyName}. No respondas a este mensaje.`],
  });

  return { subject, text, html };
}

// null = no correspondía enviarlo (sin cliente, sin correo o anulada).
export type CreditSaleEmailOutcome = "SENT" | "FAILED" | null;

export async function sendCreditSaleEmail(
  companyId: string,
  saleId: string,
): Promise<CreditSaleEmailOutcome> {
  try {
    const [sale, company, formats] = await Promise.all([
      findSaleDetail(companyId, saleId),
      findCompanySettings(companyId),
      findCompanyFormats(companyId),
    ]);
    const customer = sale?.customer;
    if (!sale || !company || !customer?.email || sale.status !== "COMPLETED") return null;

    const email = buildCreditSaleEmail({
      companyName: company.name,
      companyPhone: company.phone,
      logoUrl: publicFileUrl(company.logoPath),
      currency: formats.currency,
      dateFormat: formats.dateFormat,
      timeZone: formats.timeZone,
      customerName: customer.name,
      creditDays: customer.creditDays,
      sale: {
        number: sale.number,
        createdAt: sale.createdAt,
        total: sale.total,
        lines: sale.lines,
        payments: sale.payments.map((payment) => ({
          methodName: payment.paymentMethod.name,
          amount: payment.amount,
          isCredit: payment.paymentMethod.isCredit,
        })),
      },
    });
    await getMessageSender().sendEmail({ to: customer.email, ...email });
    return "SENT";
  } catch (error) {
    console.error("sendCreditSaleEmail: envío fallido", (error as Error).name);
    return "FAILED";
  }
}
