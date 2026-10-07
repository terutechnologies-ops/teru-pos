import "server-only";

import { PLATFORM_NAME } from "@/lib/brand";
import {
  formatCalendarDate,
  formatClock,
  formatMoney,
  type DateFormat,
} from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import {
  claimClosingReport,
  findClosingReportPeriod,
  finishClosingReport,
  type ClosingReportClaim,
  type ClosingReportPeriod,
} from "@/server/data/closing-reports";
import {
  findClosingReportEmails,
  findCompanyFormats,
  findCompanySettings,
} from "@/server/data/companies";
import { getAppUrl } from "@/server/env";
import { getMessageSender } from "@/server/services/messaging";
import type { ShoppingList, ShoppingListItem } from "@/server/services/shopping-list";
import { loadShoppingList } from "@/server/services/shopping-list";

// Reporte de cierre del día: al cerrar el último turno abierto de la
// empresa se envía a los destinatarios de Configuración > Negocio la lista
// de compras y el resumen de los turnos cerrados desde el reporte anterior.
// Lo dispara el sistema (después de responder al cierre), no una persona:
// no pide permisos y nunca hace fallar el cierre.

// Líneas de "Sin sugerencia" antes de resumir ("y N más").
const MAX_NO_SUGGESTION = 15;

export type ClosingReportEmailInput = {
  companyName: string;
  shoppingListUrl: string;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  cutoff: Date;
  shopping: ShoppingList;
  period: ClosingReportPeriod;
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// "−" para el saldo negativo, como las hojas impresas.
function quantity(value: string, unit: ShoppingListItem["unit"]) {
  return formatQuantity(value, unit).replace("-", "−");
}

function shoppingLines(shopping: ShoppingList) {
  const lines = ["LISTA DE COMPRAS"];
  if (shopping.toBuy.length + shopping.enough.length === 0) {
    lines.push(
      "Ningún insumo tiene stock ideal: defínelo en cada insumo para saber cuánto comprar.",
    );
  } else if (shopping.toBuy.length === 0) {
    lines.push("Nada por comprar: todos los insumos con stock ideal tienen lo suficiente.");
  } else {
    lines.push(`Por comprar (${shopping.toBuy.length}):`);
    for (const item of shopping.toBuy) {
      const stock = item.negativeStock
        ? `saldo negativo ${quantity(item.totalStock, item.unit)}, cuenta como 0`
        : `quedan ${quantity(item.totalStock, item.unit)}`;
      lines.push(
        `• ${item.name}: comprar ${quantity(item.toBuy!, item.unit)} (${stock}; ideal ${quantity(item.idealStock!, item.unit)})`,
      );
    }
  }
  if (shopping.enough.length > 0) {
    lines.push(`Alcanzan: ${plural(shopping.enough.length, "insumo", "insumos")}.`);
  }
  if (shopping.noSuggestion.length > 0) {
    lines.push("", `Sin sugerencia (${shopping.noSuggestion.length}):`);
    for (const item of shopping.noSuggestion.slice(0, MAX_NO_SUGGESTION)) {
      lines.push(
        `• ${item.name}: ${item.uninitialized ? "sin carga inicial" : `quedan ${quantity(item.totalStock, item.unit)}`}`,
      );
    }
    const rest = shopping.noSuggestion.length - MAX_NO_SUGGESTION;
    if (rest > 0) lines.push(`  y ${rest} más.`);
  }
  return lines;
}

function summaryLines({ period, currency, timeZone }: ClosingReportEmailInput) {
  const money = (value: { toString(): string }) => formatMoney(Number(value.toString()), currency);
  const { sales, cash, sessions } = period;
  const lines = ["RESUMEN", `Ventas: ${sales.count} por ${money(sales.total)}`];
  for (const method of sales.byMethod) lines.push(`  ${method.name}: ${money(method.amount)}`);
  if (sales.voidedCount > 0) lines.push(`Anuladas: ${sales.voidedCount} por ${money(sales.voidedTotal)}`);
  lines.push(`Gastos: ${money(cash.expenses)}`);
  if (!cash.withdrawals.isZero()) lines.push(`Retiros: ${money(cash.withdrawals)}`);
  if (!cash.deposits.isZero()) lines.push(`Ingresos: ${money(cash.deposits)}`);

  lines.push("", "CAJA");
  const branches = new Set(sessions.map((session) => session.branch.name));
  for (const session of sessions) {
    const who = branches.size > 1 ? `${session.user.name} (${session.branch.name})` : session.user.name;
    const difference = session.countedCash!.minus(session.expectedCash!);
    const result = difference.isZero()
      ? "cuadrada"
      : difference.isNegative()
        ? `faltante ${money(difference.negated())}`
        : `sobrante ${money(difference)}`;
    lines.push(`• ${who}, cerró a las ${formatClock(session.closedAt!, timeZone)}: ${result}`);
  }
  return lines;
}

// Puro: asunto y texto del correo.
export function buildClosingReportEmail(input: ClosingReportEmailInput) {
  const date = formatCalendarDate(input.cutoff, input.dateFormat, input.timeZone);
  const toBuy = input.shopping.toBuy.length;
  const subject = `Cierre del día · ${input.companyName} · ${date} · ${
    toBuy === 0 ? "nada por comprar" : `${plural(toBuy, "insumo", "insumos")} por comprar`
  }`;
  const text = [
    `${input.companyName} — Cierre del ${date}`,
    `${plural(input.period.sessions.length, "turno cerrado", "turnos cerrados")}.`,
    "",
    ...shoppingLines(input.shopping),
    "",
    ...summaryLines(input),
    "",
    "Ver la lista de compras:",
    input.shoppingListUrl,
    "",
    `Enviado por ${PLATFORM_NAME} al cerrar el último turno abierto. Para dejar de recibirlo, quita tu correo en Configuración > Negocio.`,
  ].join("\n");
  return { subject, text };
}

async function composeClosingReport(companyId: string, claim: ClosingReportClaim) {
  const [company, formats, shopping, period] = await Promise.all([
    findCompanySettings(companyId),
    findCompanyFormats(companyId),
    loadShoppingList(companyId),
    findClosingReportPeriod(companyId, claim),
  ]);
  if (!company) throw new Error("Empresa no encontrada");
  return buildClosingReportEmail({
    ...formats,
    companyName: company.name,
    shoppingListUrl: `${getAppUrl()}/${company.slug}/inventario/lista-de-compras`,
    cutoff: claim.cutoff,
    shopping,
    period,
  });
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message || error.name : "Error desconocido";
}

export type ClosingReportOutcome = "SENT" | "FAILED" | "SKIPPED" | null;

// Después de cerrar un turno: si era el último abierto, reserva el reporte y
// lo envía a cada destinatario por separado. null = no correspondía (quedan
// turnos abiertos o ya se reportó). Nunca lanza: los errores quedan en el
// reporte o en el log.
export async function sendClosingReportIfLast(
  companyId: string,
  cashSessionId: string,
): Promise<ClosingReportOutcome> {
  try {
    const recipients = await findClosingReportEmails(companyId);
    const claim = await claimClosingReport(companyId, {
      cashSessionId,
      recipientCount: recipients.length,
    });
    if (!claim) return null;
    if (recipients.length === 0) return "SKIPPED";

    let sentCount = 0;
    let error: string | null = null;
    try {
      const email = await composeClosingReport(companyId, claim);
      const sender = getMessageSender();
      for (const to of recipients) {
        try {
          await sender.sendEmail({ to, ...email });
          sentCount += 1;
        } catch (sendError) {
          error ??= describeError(sendError);
        }
      }
    } catch (composeError) {
      error = describeError(composeError);
    }
    const status = sentCount === recipients.length ? "SENT" : "FAILED";
    await finishClosingReport(companyId, claim.id, { status, sentCount, error });
    if (status === "FAILED") console.error("sendClosingReportIfLast: envío fallido", error);
    return status;
  } catch (error) {
    console.error("sendClosingReportIfLast: error inesperado", (error as Error).name);
    return null;
  }
}
