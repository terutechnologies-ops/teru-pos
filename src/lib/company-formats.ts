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

// Campo de monto mientras se escribe, con los separadores de MONEY_LOCALE:
// "200000" → "200.000"; con decimales, la coma los separa ("1.234,5").
// Descarta cualquier otro carácter. Lo entiende parseAmountInput.
export function formatAmountInput(raw: string, decimals: number) {
  const [integerPart, ...rest] = raw.split(",");
  const digits = integerPart.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimals === 0 || rest.length === 0) return grouped;
  const fraction = rest.join("").replace(/\D/g, "").slice(0, decimals);
  return `${grouped || "0"},${fraction}`;
}

// Inverso de formatAmountInput: "200.000" → "200000", "1.234,5" → "1234.5"
// (texto decimal con punto, el que validan los esquemas de dinero).
export function parseAmountInput(text: string) {
  return text.replace(/[\s.$]/g, "").replace(",", ".");
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

// Mismo día del calendario en la zona de la empresa (p. ej. un turno abierto
// "hoy" o "ayer").
export function isSameCalendarDay(a: Date, b: Date, timeZone: string) {
  const { day } = formattersFor(timeZone);
  return day.format(a) === day.format(b);
}

// Hora en la zona de la empresa: "8:05 p. m.".
export function formatClock(date: Date, timeZone: string) {
  return formattersFor(timeZone).clock.format(date);
}

// Fecha de un registro en la zona del negocio: "28/09/2026".
export function formatCalendarDate(date: Date, format: DateFormat, timeZone: string) {
  // en-CA da "AAAA-MM-DD": el día del calendario local, que formatDate
  // (con componentes UTC) escribe en el formato de la empresa.
  return formatDate(new Date(`${formattersFor(timeZone).day.format(date)}T00:00:00Z`), format);
}

// Fecha y hora de un registro en la zona del negocio: "28/09/2026 8:05 p. m.".
export function formatDateTime(date: Date, format: DateFormat, timeZone: string) {
  return `${formatCalendarDate(date, format, timeZone)} ${formatClock(date, timeZone)}`;
}

// Día del calendario en la zona de la empresa, como "AAAA-MM-DD" (el valor
// de un <input type="date">).
export function calendarDay(date: Date, timeZone: string) {
  return formattersFor(timeZone).day.format(date);
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "AAAA-MM-DD" válido (descarta 2026-02-30).
export function isCalendarDay(value: string) {
  if (!DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function addCalendarDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

// Minutos que la zona va adelante de UTC en ese instante (Bogotá: −300).
function zoneOffsetMinutes(instant: number, timeZone: string) {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((wall - Math.floor(instant / 1000) * 1000) / 60_000);
}

// Instante en que empieza ese día en la zona de la empresa (filtros por
// fecha). Se corrige dos veces por si el cambio de horario cae ese día.
export function startOfCalendarDay(day: string, timeZone: string) {
  const midnightUtc = new Date(`${day}T00:00:00Z`).getTime();
  let instant = midnightUtc - zoneOffsetMinutes(midnightUtc, timeZone) * 60_000;
  instant = midnightUtc - zoneOffsetMinutes(instant, timeZone) * 60_000;
  return new Date(instant);
}

// Rango de días de un filtro (desde/hasta de la dirección) en la zona de
// la empresa: por defecto hoy; inválidos vuelven a hoy; invertidos se
// ordenan. start/end es el intervalo [start, end) para consultar.
export function resolveDayRange(
  query: { desde?: string; hasta?: string },
  timeZone: string,
  now = new Date(),
) {
  const today = calendarDay(now, timeZone);
  let from = query.desde && isCalendarDay(query.desde) ? query.desde : today;
  let to = query.hasta && isCalendarDay(query.hasta) ? query.hasta : from;
  if (to < from) [from, to] = [to, from];
  return {
    from,
    to,
    today,
    start: startOfCalendarDay(from, timeZone),
    end: startOfCalendarDay(addCalendarDays(to, 1), timeZone),
  };
}
