import { PLATFORM_NAME } from "@/lib/brand";

// Base de los correos en HTML con la paleta TERU (esquema híbrido: encabezado
// morado oscuro con detalles lima, contenido claro con acción morada, pie
// negro). Solo tablas y estilos en línea: es lo que respetan Gmail, Outlook
// y Apple Mail (sin JS, sin SVG, sin CSS externo). Todo texto que venga de
// datos pasa por escapeHtml.

export const EMAIL_COLORS = {
  page: "#efeff2",
  surface: "#f7f7f5",
  card: "#ffffff",
  text: "#111114",
  muted: "#5b5b66",
  border: "#e2e2e7",
  primary: "#6c2bff",
  accent: "#eee7ff",
  accentText: "#4a1db8",
  brand: "#24104f",
  brandSoft: "#3a2470",
  brandText: "#d9d0f7",
  highlight: "#b8ff3d",
  success: "#1e7b34",
  successSoft: "#e7f4ea",
  danger: "#c4231a",
  dangerSoft: "#fdecea",
  footer: "#111114",
  footerText: "#a3a3ae",
} as const;

const C = EMAIL_COLORS;

export const EMAIL_FONT =
  "'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Insignia (texto corto en mayúsculas).
export function badge(label: string, colors: { bg: string; fg: string }) {
  return `<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:${colors.bg};color:${colors.fg};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap">${escapeHtml(label)}</span>`;
}

// Botón de acción (morado sobre claro) o enlace secundario.
export function button(href: string, label: string, variant: "primary" | "secondary" = "primary") {
  const style =
    variant === "primary"
      ? `background:${C.primary};color:#ffffff;border:1px solid ${C.primary}`
      : `background:${C.card};color:${C.accentText};border:1px solid ${C.border}`;
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:10px;${style};font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

// Marca de la empresa en el encabezado: su logo sobre blanco o su inicial en
// lima (como el ícono de tienda del sistema).
function companyMark(companyName: string, logoUrl: string | null) {
  if (logoUrl) {
    return `<td width="52" valign="top" style="padding-right:14px"><img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="${escapeHtml(companyName)}" style="display:block;width:48px;height:48px;border-radius:12px;background:#ffffff;object-fit:contain"></td>`;
  }
  const initial = escapeHtml(companyName.trim().charAt(0).toUpperCase() || "·");
  return `<td width="52" valign="top" style="padding-right:14px"><div style="width:48px;height:48px;border-radius:12px;background:${C.highlight};color:${C.text};font-size:22px;font-weight:800;line-height:48px;text-align:center">${initial}</div></td>`;
}

export type EmailHeader = {
  companyName: string;
  logoUrl: string | null;
  // Insignia lima sobre el nombre ("Reporte de cierre").
  eyebrow: string;
  subtitle?: string;
  // Pastillas bajo el título ("Corte: 06/10/2026", "2 turnos cerrados").
  chips?: string[];
};

function header({ companyName, logoUrl, eyebrow, subtitle, chips = [] }: EmailHeader) {
  const chipHtml = chips
    .map(
      (chip) =>
        `<span style="display:inline-block;margin:10px 6px 0 0;padding:5px 10px;border-radius:999px;background:${C.brandSoft};color:#f7f7f5;font-size:12px;font-weight:600">${escapeHtml(chip)}</span>`,
    )
    .join("");
  return `<tr><td style="background:${C.brand};padding:28px 28px 26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${companyMark(companyName, logoUrl)}
<td valign="top">
${badge(eyebrow, { bg: C.highlight, fg: C.text })}
<div style="margin-top:8px;color:#ffffff;font-size:24px;line-height:1.2;font-weight:800">${escapeHtml(companyName)}</div>
${subtitle ? `<div style="margin-top:4px;color:${C.brandText};font-size:13px">${escapeHtml(subtitle)}</div>` : ""}
${chipHtml ? `<div>${chipHtml}</div>` : ""}
</td></tr></table>
</td></tr>`;
}

function footer(lines: string[]) {
  const text = lines
    .map(
      (line) =>
        `<p style="margin:8px 0 0;color:${C.footerText};font-size:11px;line-height:1.6">${escapeHtml(line)}</p>`,
    )
    .join("");
  return `<tr><td style="background:${C.footer};padding:22px 28px">
<div style="color:#ffffff;font-size:13px;font-weight:800">${escapeHtml(PLATFORM_NAME)} <span style="color:${C.highlight}">●</span></div>
${text}
</td></tr>`;
}

// Documento completo. preheader: el texto que muestran los clientes de
// correo junto al asunto. body: filas (<tr>) ya armadas y escapadas.
export function emailLayout(input: {
  title: string;
  preheader: string;
  header: EmailHeader;
  body: string;
  footer: string[];
}) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.title)}</title>
<style>
@media (max-width: 560px) {
  .col { display:block !important; width:100% !important; padding:0 0 10px !important; }
  .stack { display:block !important; width:auto !important; }
  .stack-end { text-align:left !important; padding-top:0 !important; }
  .px { padding-left:18px !important; padding-right:18px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${EMAIL_FONT};color:${C.text}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${C.surface};border:1px solid ${C.border};border-radius:16px;overflow:hidden;font-family:${EMAIL_FONT}">
${header(input.header)}
${input.body}
${footer(input.footer)}
</table>
</td></tr></table>
</body></html>`;
}

// Fila de contenido con el margen del cuerpo.
export function bodyRow(content: string, padding = "24px 28px 0") {
  return `<tr><td class="px" style="padding:${padding}">${content}</td></tr>`;
}

// Título de sección con descripción opcional y una insignia a la derecha.
export function sectionTitle(title: string, description?: string, aside?: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>
<td valign="bottom"><div style="font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${C.text}">${escapeHtml(title)}</div>${
    description ? `<div style="margin-top:2px;font-size:12px;color:${C.muted}">${escapeHtml(description)}</div>` : ""
  }</td>
${aside ? `<td valign="bottom" align="right">${aside}</td>` : ""}
</tr></table>`;
}

// Tarjeta blanca con borde.
export function card(content: string, padding = "18px 20px") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:12px"><tr><td style="padding:${padding}">${content}</td></tr></table>`;
}

export type EmailDetail = { label: string; value: string; href?: string };

// Bloque de datos clave (p. ej. "Tu acceso": correo, rol, dirección) en
// filas etiqueta / valor sobre fondo gris claro.
function detailsBlock(title: string, rows: EmailDetail[]) {
  const rowHtml = rows
    .map(({ label, value, href }) => {
      const shown = href
        ? `<a href="${escapeHtml(href)}" style="color:${C.accentText};word-break:break-all">${escapeHtml(value)}</a>`
        : escapeHtml(value);
      return `<tr>
<td class="stack" valign="top" width="120" style="padding:6px 12px 0 0;font-size:12px;color:${C.muted};white-space:nowrap">${escapeHtml(label)}</td>
<td class="stack" valign="top" style="padding:6px 0 0;font-size:14px;font-weight:600;color:${C.text};word-break:break-word">${shown}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background:${C.surface};border:1px solid ${C.border};border-radius:10px"><tr><td style="padding:14px 16px 16px">
<div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${C.text}">${escapeHtml(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowHtml}</table>
</td></tr></table>`;
}

// Correo sencillo con una acción (recuperar contraseña, invitación): saludo,
// párrafos, botón, el enlace en texto por si el botón no abre y, si hay,
// los datos clave para guardar.
export function simpleEmail(input: {
  title: string;
  preheader: string;
  header: EmailHeader;
  greeting: string;
  paragraphs: string[];
  details?: { title: string; rows: EmailDetail[] };
  action: { href: string; label: string };
  note: string;
}) {
  const paragraphs = input.paragraphs
    .map((text) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.text}">${escapeHtml(text)}</p>`)
    .join("");
  const details = input.details ? detailsBlock(input.details.title, input.details.rows) : "";
  const content = card(
    `<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:${C.text}">${escapeHtml(input.greeting)}</p>
${paragraphs}
<div style="margin:20px 0 18px">${button(input.action.href, input.action.label)}</div>
<p style="margin:0 0 6px;font-size:12px;color:${C.muted}">Si el botón no abre, copia este enlace en el navegador:</p>
<p style="margin:0 0 14px;font-size:12px;word-break:break-all"><a href="${escapeHtml(input.action.href)}" style="color:${C.accentText}">${escapeHtml(input.action.href)}</a></p>
${details}
<p style="margin:0;font-size:12px;color:${C.muted}">${escapeHtml(input.note)}</p>`,
    "24px 24px",
  );
  return emailLayout({
    title: input.title,
    preheader: input.preheader,
    header: input.header,
    body: bodyRow(content, "24px 28px 28px"),
    footer: [`Correo automático de ${PLATFORM_NAME} para ${input.header.companyName}. No respondas a este mensaje.`],
  });
}
