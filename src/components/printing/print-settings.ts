// Ajustes de impresión de este equipo, guardados en el navegador: cada caja
// tiene su impresora, así que no van en la base de datos.

export const PAPER_WIDTHS = ["80", "58"] as const;

export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export type PrintSettings = {
  paperWidth: PaperWidth;
  // Comanda automática al cobrar en el POS.
  printTicketOnCheckout: boolean;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperWidth: "80",
  printTicketOnCheckout: true,
};

const STORAGE_KEY = "teru-pos:impresion";

// Lo guardado puede venir de otra versión o estar dañado: cada valor que no
// se entienda vuelve a su valor por defecto.
export function parsePrintSettings(raw: unknown): PrintSettings {
  const saved = raw && typeof raw === "object" ? (raw as Partial<PrintSettings>) : {};
  return {
    paperWidth: PAPER_WIDTHS.includes(saved.paperWidth as PaperWidth)
      ? (saved.paperWidth as PaperWidth)
      : DEFAULT_PRINT_SETTINGS.paperWidth,
    printTicketOnCheckout:
      typeof saved.printTicketOnCheckout === "boolean"
        ? saved.printTicketOnCheckout
        : DEFAULT_PRINT_SETTINGS.printTicketOnCheckout,
  };
}

// Sin almacenamiento (modo privado) se usan los valores por defecto.
export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parsePrintSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}

export function savePrintSettings(settings: PrintSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento: el ajuste dura hasta recargar.
  }
}
