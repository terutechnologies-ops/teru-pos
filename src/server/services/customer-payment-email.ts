import "server-only";

import { PLATFORM_NAME } from "@/lib/brand";
import { formatDateTime, formatMoney, type DateFormat } from "@/lib/company-formats";
import { findCompanyFormats, findCompanySettings } from "@/server/data/companies";
import { findCustomerPayment } from "@/server/data/customer-payments";
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

// Constancia de un abono para el cliente de crédito: cuánto pagó, cómo, el
// número del abono y lo que sigue debiendo (guardado al registrarlo). Se
// envía después de registrar y nunca lanza: un fallo del correo no afecta
// el abono.

type Decimalish = { toString(): string };

export type CustomerPaymentEmailInput = {
  companyName: string;
  companyPhone: string | null;
  logoUrl: string | null;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  customerName: string;
  payment: {
    number: number;
    createdAt: Date;
    amount: Decimalish;
    methodName: string;
    balanceAfter: Decimalish;
  };
};

export function buildCustomerPaymentEmail(input: CustomerPaymentEmailInput) {
  const { payment, companyName, customerName, currency } = input;
  const money = (value: Decimalish) => formatMoney(Number(value.toString()), currency);
  const when = formatDateTime(payment.createdAt, input.dateFormat, input.timeZone);
  const settled = Number(payment.balanceAfter.toString()) === 0;
  const contact = input.companyPhone
    ? `Si no reconoces este abono, comunícate con ${companyName} al ${input.companyPhone}.`
    : `Si no reconoces este abono, comunícate con ${companyName}.`;

  const subject = `Abono recibido en ${companyName} · Abono #${payment.number} · ${money(payment.amount)}`;
  const intro = `Recibimos tu abono de ${money(payment.amount)} a tu cuenta en ${companyName}.`;
  const status = settled
    ? "Con este abono quedas a paz y salvo."
    : `Tu saldo pendiente es de ${money(payment.balanceAfter)}.`;
  const footer = `Correo automático de ${PLATFORM_NAME} para ${companyName}. No respondas a este mensaje.`;

  const text = [
    `Hola ${customerName},`,
    "",
    `${intro} ${status}`,
    "",
    `Abono #${payment.number} · ${when}`,
    `Abono: ${money(payment.amount)}`,
    `Forma de pago: ${payment.methodName}`,
    `Saldo pendiente: ${money(payment.balanceAfter)}`,
    "",
    contact,
    "",
    footer,
  ].join("\n");

  const body = [
    bodyRow(
      card(
        `<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:${C.text}">${escapeHtml(`Hola ${customerName},`)}</p>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.text}">${escapeHtml(`${intro} ${status}`)}</p>`,
        "24px 24px",
      ),
    ),
    bodyRow(
      sectionTitle("Tu abono") +
        card(
          amountTable([
            { label: "Abono", value: money(payment.amount), strong: true },
            { label: "Forma de pago", value: payment.methodName },
            { label: "Saldo pendiente", value: money(payment.balanceAfter), strong: true },
          ]),
        ),
    ),
    bodyRow(
      `<p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted}">${escapeHtml(contact)}</p>`,
      "18px 28px 28px",
    ),
  ].join("\n");

  const html = emailLayout({
    title: subject,
    preheader: `${intro} ${status}`,
    header: {
      companyName,
      logoUrl: input.logoUrl,
      eyebrow: "Abono recibido",
      chips: [`Abono #${payment.number}`, when],
    },
    body,
    footer: [footer],
  });

  return { subject, text, html };
}

// null = no correspondía enviarlo (sin correo o anulado).
export type CustomerPaymentEmailOutcome = "SENT" | "FAILED" | null;

export async function sendCustomerPaymentEmail(
  companyId: string,
  paymentId: string,
): Promise<CustomerPaymentEmailOutcome> {
  try {
    const [payment, company, formats] = await Promise.all([
      findCustomerPayment(companyId, paymentId),
      findCompanySettings(companyId),
      findCompanyFormats(companyId),
    ]);
    const email = payment?.customer.email;
    if (!payment || !company || !email || payment.status !== "RECORDED") return null;

    await getMessageSender().sendEmail({
      to: email,
      ...buildCustomerPaymentEmail({
        companyName: company.name,
        companyPhone: company.phone,
        logoUrl: publicFileUrl(company.logoPath),
        currency: formats.currency,
        dateFormat: formats.dateFormat,
        timeZone: formats.timeZone,
        customerName: payment.customer.name,
        payment: {
          number: payment.number,
          createdAt: payment.createdAt,
          amount: payment.amount,
          methodName: payment.paymentMethod.name,
          balanceAfter: payment.balanceAfter,
        },
      }),
    });
    return "SENT";
  } catch (error) {
    console.error("sendCustomerPaymentEmail: envío fallido", (error as Error).name);
    return "FAILED";
  }
}
