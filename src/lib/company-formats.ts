// Moneda y formatos de la empresa. Se usa en el servidor (validación) y en
// el cliente (vista previa del asistente), por eso no depende de nada más.

// Monedas ISO 4217 que conoce el runtime (Node y navegadores modernos).
export const CURRENCY_CODES: readonly string[] = Intl.supportedValuesOf("currency");

// Accesos rápidos del asistente; el resto se elige de la lista completa.
export const FEATURED_CURRENCIES = ["COP", "USD", "MXN", "EUR"] as const;

export function isCurrencyCode(code: string) {
  return CURRENCY_CODES.includes(code);
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
