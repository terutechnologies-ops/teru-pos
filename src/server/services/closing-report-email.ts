import { PLATFORM_NAME } from "@/lib/brand";
import {
  formatCalendarDate,
  formatClock,
  formatDateTime,
  formatMoney,
  formatPercent,
  type DateFormat,
} from "@/lib/company-formats";
import { formatQuantity } from "@/lib/units";
import type { ClosingReportPeriod } from "@/server/data/closing-reports";
import {
  badge,
  bodyRow,
  button,
  card,
  EMAIL_COLORS as C,
  emailLayout,
  escapeHtml,
  sectionTitle,
} from "@/server/services/messaging/email-layout";
import type { ShoppingList, ShoppingListItem } from "@/server/services/shopping-list";

// Correo del reporte de cierre: HTML con la marca (guía visual
// Diseño-guia-correo, traducida a la paleta TERU) y el mismo contenido en
// texto plano para los clientes que no muestran HTML. Puro: sin consultas.

// Insumos "sin sugerencia" que se listan antes de resumir ("y N más").
const MAX_NO_SUGGESTION = 15;

export type ClosingReportEmailInput = {
  companyName: string;
  logoUrl: string | null;
  // URL de la empresa en el sistema (APP_URL/slug), para los enlaces.
  companyUrl: string;
  currency: string;
  dateFormat: DateFormat;
  timeZone: string;
  cutoff: Date;
  shopping: ShoppingList;
  period: ClosingReportPeriod;
};

type Decimalish = { toString(): string };
type ReportSession = ClosingReportPeriod["sessions"][number];

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// "−" para el saldo negativo, como las hojas impresas.
function quantity(value: string, unit: ShoppingListItem["unit"]) {
  return formatQuantity(value, unit).replace("-", "−");
}

function moneyOf(currency: string) {
  return (value: Decimalish) => formatMoney(Number(value.toString()), currency);
}

// Resultado del cuadre de un turno cerrado.
function cashResult(session: ReportSession) {
  const difference = session.countedCash!.minus(session.expectedCash!);
  if (difference.isZero()) return { kind: "even" as const, amount: difference };
  return difference.isNegative()
    ? { kind: "short" as const, amount: difference.negated() }
    : { kind: "over" as const, amount: difference };
}

function sessionName(session: ReportSession, multipleBranches: boolean) {
  return multipleBranches ? `${session.user.name} (${session.branch.name})` : session.user.name;
}

// --- Texto plano ------------------------------------------------------------

function shoppingText(shopping: ShoppingList) {
  const lines = ["LISTA DE COMPRAS"];
  if (shopping.toBuy.length + shopping.enough.length === 0) {
    lines.push("Ningún insumo tiene stock ideal: defínelo en cada insumo para saber cuánto comprar.");
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

function summaryText({ period, currency, timeZone }: ClosingReportEmailInput) {
  const money = moneyOf(currency);
  const { sales, cash, sessions } = period;
  const lines = ["RESUMEN", `Ventas: ${sales.count} por ${money(sales.total)}`];
  for (const method of sales.byMethod) lines.push(`  ${method.name}: ${money(method.amount)}`);
  if (sales.voidedCount > 0) lines.push(`Anuladas: ${sales.voidedCount} por ${money(sales.voidedTotal)}`);
  lines.push(`Gastos: ${money(cash.expenses)}`);
  if (!cash.withdrawals.isZero()) lines.push(`Retiros: ${money(cash.withdrawals)}`);
  if (!cash.deposits.isZero()) lines.push(`Ingresos: ${money(cash.deposits)}`);

  lines.push("", "CAJA");
  const multipleBranches = new Set(sessions.map((session) => session.branch.name)).size > 1;
  for (const session of sessions) {
    const result = cashResult(session);
    const text =
      result.kind === "even"
        ? "cuadrada"
        : `${result.kind === "short" ? "faltante" : "sobrante"} ${money(result.amount)}`;
    lines.push(
      `• ${sessionName(session, multipleBranches)}, cerró a las ${formatClock(session.closedAt!, timeZone)}: ${text}`,
    );
  }
  return lines;
}

// --- HTML ---------------------------------------------------------------------

const RESULT_STYLE = {
  even: { label: "Cuadrada", title: "Caja cuadrada", bg: C.successSoft, fg: C.success },
  short: { label: "Faltante", title: "Faltante en caja", bg: C.dangerSoft, fg: C.danger },
  over: { label: "Sobrante", title: "Sobrante en caja", bg: C.accent, fg: C.accentText },
} as const;

function cashHtml({ period, currency, timeZone }: ClosingReportEmailInput) {
  const money = moneyOf(currency);
  const multipleBranches = new Set(period.sessions.map((session) => session.branch.name)).size > 1;
  const rows = period.sessions
    .map((session) => {
      const result = cashResult(session);
      const style = RESULT_STYLE[result.kind];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:${C.card};border:1px solid ${C.border};border-left:4px solid ${style.fg};border-radius:12px"><tr>
<td class="stack" style="padding:16px 18px">
${badge(style.label, { bg: style.bg, fg: style.fg })}
<span style="margin-left:6px;font-size:12px;color:${C.muted}">Cierre ${escapeHtml(formatClock(session.closedAt!, timeZone))}</span>
<div style="margin-top:6px;font-size:15px;color:${C.text}">Responsable: <strong>${escapeHtml(sessionName(session, multipleBranches))}</strong></div>
</td>
<td class="stack stack-end" align="right" style="padding:16px 18px;white-space:nowrap">
<div style="font-size:12px;color:${C.muted}">${style.title}</div>
<div style="font-size:22px;font-weight:800;color:${style.fg}">${escapeHtml(money(result.amount))}</div>
</td></tr></table>`;
    })
    .join("");
  return sectionTitle("Cuadre de caja", `${plural(period.sessions.length, "turno cerrado", "turnos cerrados")} en este reporte`) + rows;
}

function kpi(label: string, value: string, note: string, color: string) {
  return `<td class="col" width="33%" valign="top" style="padding:0 5px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-bottom:4px solid ${color};border-radius:12px"><tr><td style="padding:14px 16px">
<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">${escapeHtml(label)}</div>
<div style="margin-top:4px;font-size:20px;font-weight:800;color:${C.text};white-space:nowrap">${escapeHtml(value)}</div>
<div style="margin-top:2px;font-size:12px;color:${C.muted}">${escapeHtml(note)}</div>
</td></tr></table></td>`;
}

function summaryHtml({ period, currency }: ClosingReportEmailInput) {
  const money = moneyOf(currency);
  const { sales, cash } = period;
  const cards = [
    kpi("Ventas", money(sales.total), plural(sales.count, "venta", "ventas"), C.primary),
    kpi("Gastos", money(cash.expenses), "De la caja", C.danger),
    kpi("Retiros", money(cash.withdrawals), "Efectivo retirado", C.text),
  ];
  if (!cash.deposits.isZero()) cards.push(kpi("Ingresos", money(cash.deposits), "Efectivo agregado", C.success));
  // Filas de tres tarjetas (en el celular se apilan).
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 3) {
    const slice = cards.slice(i, i + 3);
    while (slice.length < 3) slice.push('<td class="col" width="33%"></td>');
    rows.push(`<tr>${slice.join("")}</tr>`);
  }
  const kpis = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;

  const total = Number(sales.total.toString());
  const methods = sales.byMethod
    .map((method) => {
      const amount = Number(method.amount.toString());
      const share = total > 0 ? formatPercent((amount / total) * 100) : "";
      return `<tr>
<td style="padding:9px 0;border-top:1px solid ${C.border}"><div style="font-size:14px;font-weight:600;color:${C.text}">${escapeHtml(method.name)}</div>${
        share ? `<div style="font-size:12px;color:${C.muted}">${escapeHtml(share)} del total</div>` : ""
      }</td>
<td align="right" style="padding:9px 0;border-top:1px solid ${C.border};font-size:15px;font-weight:700;color:${C.text};white-space:nowrap">${escapeHtml(money(method.amount))}</td></tr>`;
    })
    .join("");
  const methodsCard =
    sales.byMethod.length > 0
      ? card(
          `<div style="margin-bottom:4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">Por método de pago</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${methods}</table>`,
          "14px 18px 6px",
        )
      : "";
  const voided =
    sales.voidedCount > 0
      ? `<p style="margin:10px 0 0;font-size:12px;color:${C.muted}">Anuladas: ${escapeHtml(
          `${sales.voidedCount} por ${money(sales.voidedTotal)}`,
        )} (no suman en las ventas).</p>`
      : "";
  return sectionTitle("Resumen del día", "Ventas y movimientos de caja de los turnos cerrados") + kpis + methodsCard + voided;
}

// Barra de existencia frente al ideal (tabla anidada: los correos no
// soportan barras con CSS moderno).
function stockBar(item: ShoppingListItem) {
  const stock = Math.max(Number(item.totalStock), 0);
  const ideal = Number(item.idealStock);
  const percent = ideal > 0 ? Math.min(100, Math.round((stock / ideal) * 100)) : 0;
  const fill =
    percent > 0
      ? `<table role="presentation" width="${percent}%" cellpadding="0" cellspacing="0"><tr><td style="height:8px;background:${C.primary};border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table>`
      : "&nbsp;";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td style="height:8px;background:${C.page};border-radius:4px;font-size:0;line-height:0">${fill}</td></tr></table>`;
}

function toBuyRow(item: ShoppingListItem, first: boolean) {
  const ideal = Number(item.idealStock);
  const missing = ideal > 0 ? formatPercent((Number(item.toBuy) / ideal) * 100) : "";
  const stock = item.negativeStock
    ? `<span style="color:${C.danger};font-weight:700">Saldo negativo ${escapeHtml(quantity(item.totalStock, item.unit))}</span> (cuenta como 0)`
    : `Quedan <strong style="color:${C.text}">${escapeHtml(quantity(item.totalStock, item.unit))}</strong>`;
  return `<tr><td style="padding:14px 18px;${first ? "" : `border-top:1px solid ${C.border}`}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="font-size:15px;font-weight:700;color:${C.text}">${escapeHtml(item.name)}${
    item.belowMinimum ? ` ${badge("Bajo mínimo", { bg: C.dangerSoft, fg: C.danger })}` : ""
  }</td>
<td valign="middle" align="right" style="white-space:nowrap"><span style="display:inline-block;padding:5px 10px;border-radius:8px;background:${C.accent};color:${C.accentText};font-size:13px;font-weight:800">Comprar ${escapeHtml(quantity(item.toBuy!, item.unit))}</span></td>
</tr></table>
${stockBar(item)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>
<td style="font-size:12px;color:${C.muted}">${stock}</td>
<td align="right" style="font-size:12px;color:${C.muted};white-space:nowrap">Ideal <strong style="color:${C.text}">${escapeHtml(quantity(item.idealStock!, item.unit))}</strong>${missing ? ` · falta ${escapeHtml(missing)}` : ""}</td>
</tr></table>
</td></tr>`;
}

function notice(text: string, colors: { bg: string; fg: string }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg};border-radius:12px"><tr><td style="padding:14px 18px;font-size:14px;color:${colors.fg};font-weight:600">${escapeHtml(text)}</td></tr></table>`;
}

function shoppingHtml({ shopping }: ClosingReportEmailInput) {
  const count = shopping.toBuy.length;
  const title = sectionTitle(
    "Lista de compras",
    "Lo que falta para volver al stock ideal (todas las bodegas)",
    count > 0 ? badge(`${count} por comprar`, { bg: C.accent, fg: C.accentText }) : undefined,
  );
  let content: string;
  if (count + shopping.enough.length === 0) {
    content = notice(
      "Ningún insumo tiene stock ideal: defínelo en cada insumo para saber cuánto comprar.",
      { bg: C.accent, fg: C.accentText },
    );
  } else if (count === 0) {
    content = notice("Nada por comprar: todos los insumos con stock ideal tienen lo suficiente.", {
      bg: C.successSoft,
      fg: C.success,
    });
  } else {
    content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:12px">${shopping.toBuy
      .map((item, index) => toBuyRow(item, index === 0))
      .join("")}</table>`;
  }
  const enough =
    shopping.enough.length > 0
      ? `<p style="margin:10px 0 0;font-size:12px;color:${C.muted}">${escapeHtml(
          `${plural(shopping.enough.length, "insumo alcanza", "insumos alcanzan")} su stock ideal.`,
        )}</p>`
      : "";
  return title + content + enough;
}

function noSuggestionHtml({ shopping }: ClosingReportEmailInput) {
  const items = shopping.noSuggestion;
  if (items.length === 0) return "";
  const rows = items
    .slice(0, MAX_NO_SUGGESTION)
    .map((item) => {
      const state = item.negativeStock
        ? badge("Revisar saldo", { bg: C.dangerSoft, fg: C.danger })
        : item.uninitialized
          ? badge("Sin carga inicial", { bg: C.page, fg: C.muted })
          : badge("Sin stock ideal", { bg: C.page, fg: C.muted });
      const stock = item.uninitialized ? "—" : quantity(item.totalStock, item.unit);
      return `<tr>
<td style="padding:10px 18px;border-top:1px solid ${C.border};font-size:14px;color:${C.text}">${escapeHtml(item.name)}</td>
<td style="padding:10px 8px;border-top:1px solid ${C.border};font-size:14px;font-weight:700;white-space:nowrap;color:${
        item.negativeStock ? C.danger : C.text
      }">${escapeHtml(stock)}</td>
<td align="right" style="padding:10px 18px;border-top:1px solid ${C.border}">${state}</td></tr>`;
    })
    .join("");
  const rest = items.length - MAX_NO_SUGGESTION;
  const more =
    rest > 0
      ? `<tr><td colspan="3" style="padding:10px 18px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted}">y ${rest} más.</td></tr>`
      : "";
  const head = `<tr>
<td style="padding:10px 18px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">Insumo</td>
<td style="padding:10px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">Queda</td>
<td align="right" style="padding:10px 18px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted}">Estado</td></tr>`;
  return (
    sectionTitle(
      "Sin sugerencia",
      "Sin stock ideal o sin carga inicial: solo lo que queda",
      badge(plural(items.length, "insumo", "insumos"), { bg: C.page, fg: C.muted }),
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:12px">${head}${rows}${more}</table>`
  );
}

function reportHtml(input: ClosingReportEmailInput, subject: string, date: string) {
  const toBuy = input.shopping.toBuy.length;
  const sessions = input.period.sessions.length;
  const actions = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border}"><tr><td style="padding-top:20px">
${button(`${input.companyUrl}/inventario/lista-de-compras`, "Ver lista de compras")}
<span style="display:inline-block;width:8px"></span>
${button(`${input.companyUrl}/caja`, "Ver cierres de caja", "secondary")}
</td></tr></table>`;
  const body = [
    bodyRow(cashHtml(input), "26px 28px 0"),
    bodyRow(summaryHtml(input)),
    bodyRow(shoppingHtml(input)),
    noSuggestionHtml(input) && bodyRow(noSuggestionHtml(input)),
    bodyRow(actions, "24px 28px 28px"),
  ]
    .filter(Boolean)
    .join("\n");
  return emailLayout({
    title: subject,
    preheader: `${toBuy === 0 ? "Nada por comprar" : plural(toBuy, "insumo por comprar", "insumos por comprar")} · Ventas ${moneyOf(input.currency)(input.period.sales.total)}`,
    header: {
      companyName: input.companyName,
      logoUrl: input.logoUrl,
      eyebrow: "Reporte de cierre",
      subtitle: "Lista de compras y resumen del día",
      chips: [`Corte: ${date}`, plural(sessions, "turno cerrado", "turnos cerrados")],
    },
    body,
    footer: [
      `Generado el ${formatDateTime(input.cutoff, input.dateFormat, input.timeZone)}, al cerrar el último turno abierto de ${input.companyName}.`,
      "Para dejar de recibirlo, quita tu correo en Configuración > Negocio.",
      "Contiene información interna del negocio. Si lo recibiste por error, avísale a quien lo administra y elimínalo.",
    ],
  });
}

// Asunto, texto plano y HTML del reporte.
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
    ...shoppingText(input.shopping),
    "",
    ...summaryText(input),
    "",
    "Ver la lista de compras:",
    `${input.companyUrl}/inventario/lista-de-compras`,
    "",
    `Enviado por ${PLATFORM_NAME} al cerrar el último turno abierto. Para dejar de recibirlo, quita tu correo en Configuración > Negocio.`,
  ].join("\n");
  return { subject, text, html: reportHtml(input, subject, date) };
}
