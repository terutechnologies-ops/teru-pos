// Moneda y formatos de la empresa. Se usa en el servidor (validación) y en
// el cliente (vista previa del asistente), por eso no depende de nada más.

// Monedas habilitadas (códigos ISO 4217). Para habilitar otra basta con
// agregarla aquí: el asistente y la validación usan esta lista.
export const SUPPORTED_CURRENCIES = ["COP", "USD", "MXN", "EUR"] as const;

export function isSupportedCurrency(code: string) {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

const currencyNames = new Intl.DisplayNames("es", { type: "currency" });

export function currencyName(code: string) {
  const name = currencyNames.of(code) ?? code;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Separadores colombianos (punto para miles, coma para decimales) hasta que
// exista un formato de números por empresa (módulo de productos y precios).
// Los decimales los define la moneda: COP 0, USD 2.
const MONEY_LOCALE = "es-CO";

// Decimales que usa la moneda (COP 0, USD 2).
export function currencyDecimals(currency: string) {
  return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits ?? 2;
}

// Costos por unidad: con los decimales de la moneda y hasta 4 si hacen
// falta ("$ 3,25" por gramo en COP). "3200.5" → "$ 3.200,5".
export function formatUnitCost(amount: string | number, currency: string) {
  return new Intl.NumberFormat(MONEY_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: currencyDecimals(currency),
    maximumFractionDigits: 4,
  }).format(Number(amount));
}

// Porcentaje con un decimal como máximo: "70,1 %".
export function formatPercent(value: string | number) {
  const number = new Intl.NumberFormat(MONEY_LOCALE, { maximumFractionDigits: 1 }).format(
    Number(value),
  );
  return `${number} %`;
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(MONEY_LOCALE, {
    style: "currency",
    currency,
  }).format(amount);
}

export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export function isDateFormat(value: string): value is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(value);
}

// Con componentes UTC: el resultado no depende de la zona horaria de quien
// lo ejecuta (servidor y navegador muestran lo mismo).
export function formatDate(date: Date, format: DateFormat) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return format.replace("DD", dd).replace("MM", mm).replace("YYYY", yyyy);
}

// Zonas horarias habilitadas (IANA), con el nombre que ve el usuario. Para
// habilitar otra basta con agregarla aquí. Las fechas se guardan en UTC y se
// muestran en la zona de la empresa; también define el "día" de las ventas.
export const SUPPORTED_TIME_ZONES = {
  "America/Bogota": "Bogotá",
  "America/Mexico_City": "Ciudad de México",
  "America/Lima": "Lima",
  "America/Panama": "Panamá",
  "America/Guayaquil": "Guayaquil",
  "America/Caracas": "Caracas",
  "America/Santiago": "Santiago de Chile",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/New_York": "Nueva York",
  "Europe/Madrid": "Madrid",
} as const;

export type SupportedTimeZone = keyof typeof SUPPORTED_TIME_ZONES;

export const DEFAULT_TIME_ZONE: SupportedTimeZone = "America/Bogota";

export function isSupportedTimeZone(value: string): value is SupportedTimeZone {
  return Object.hasOwn(SUPPORTED_TIME_ZONES, value);
}

// Formateadores por zona: crearlos cuesta más que usarlos.
const formatters = new Map<string, { day: Intl.DateTimeFormat; clock: Intl.DateTimeFormat }>();

function formattersFor(timeZone: string) {
  let entry = formatters.get(timeZone);
  if (!entry) {
    entry = {
      day: new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      clock: new Intl.DateTimeFormat("es-CO", { timeZone, hour: "numeric", minute: "2-digit" }),
    };
    formatters.set(timeZone, entry);
  }
  return entry;
}

// Hora en la zona de la empresa: "8:05 p. m.".
export function formatClock(date: Date, timeZone: string) {
  return formattersFor(timeZone).clock.format(date);
}

// Fecha y hora de un registro en la zona del negocio: "28/09/2026 8:05 p. m.".
export function formatDateTime(date: Date, format: DateFormat, timeZone: string) {
  // en-CA da "AAAA-MM-DD": el día del calendario local, que formatDate
  // (con componentes UTC) escribe en el formato de la empresa.
  const day = new Date(`${formattersFor(timeZone).day.format(date)}T00:00:00Z`);
  return `${formatDate(day, format)} ${formatClock(date, timeZone)}`;
}
