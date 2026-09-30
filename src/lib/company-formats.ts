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

// Zona horaria con la que se muestran las fechas y horas registradas (que
// se guardan en UTC). Es la misma para todas las empresas hasta que cada
// una tenga la suya: llegará con caja y ventas, que cortan por día.
export const BUSINESS_TIME_ZONE = "America/Bogota";

const calendarDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockTime = new Intl.DateTimeFormat("es-CO", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

// Fecha y hora de un registro en la zona del negocio: "28/09/2026 8:05 p. m.".
export function formatDateTime(date: Date, format: DateFormat) {
  // en-CA da "AAAA-MM-DD": el día del calendario local, que formatDate
  // (con componentes UTC) escribe en el formato de la empresa.
  const day = new Date(`${calendarDay.format(date)}T00:00:00Z`);
  return `${formatDate(day, format)} ${clockTime.format(date)}`;
}
