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

function row(label: string, value: string, strong = false) {
  const weight = strong ? "800" : "600";
  const size = strong ? "16px" : "14px";
  return `<tr>
<td style="padding:6px 12px 6px 0;font-size:${size};color:${C.text};font-weight:${strong ? "800" : "400"}">${label}</td>
<td align="right" style="padding:6px 0;font-size:${size};font-weight:${weight};color:${C.text};white-space:nowrap">${value}</td>
</tr>`;
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

  const lineRows = sale.lines
    .map((line) =>
      row(`${line.quantity} × ${escapeHtml(line.productName)}`, escapeHtml(money(line.lineTotal))),
    )
    .join("");
  const paymentRows = [
    row("Cargado a tu cuenta", escapeHtml(formatMoney(onCredit, currency)), true),
    ...otherPayments.map((payment) =>
      row(`Pagado con ${escapeHtml(payment.methodName)}`, escapeHtml(money(payment.amount))),
    ),
    row("Fecha límite de pago", escapeHtml(due)),
  ].join("");
  const table = (rows: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;

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
          table(lineRows) +
            `<div style="margin-top:8px;border-top:2px solid ${C.border}"></div>` +
            table(row("Total", escapeHtml(money(sale.total)), true)),
        ),
    ),
    bodyRow(sectionTitle("Tu crédito") + card(table(paymentRows))),
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
