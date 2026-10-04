import type { CountFormEntry } from "@/server/services/inventory-counts";

// Compartido entre el formulario del conteo (cliente) y sus acciones
// (servidor).

export const COUNT_FORM_ID = "count-form";

// Cada fila envía su insumo (`supply`, repetido), lo escrito
// (`contado_<id>`) y la unidad que se mostró (`unidad_<id>`).
export const countedName = (supplyId: string) => `contado_${supplyId}`;
export const unitName = (supplyId: string) => `unidad_${supplyId}`;

export type CountIntent = "save" | "confirm";

export type CountFormState = {
  status: "idle" | "saved" | "error";
  intent: CountIntent;
  message: string | null;
  // Por insumo.
  fieldErrors: Record<string, string>;
  values: Record<string, string>;
};

export function readCountForm(formData: FormData): CountFormEntry[] {
  return formData.getAll("supply").map((value) => {
    const supplyId = String(value);
    return {
      supplyId,
      counted: String(formData.get(countedName(supplyId)) ?? ""),
      unit: String(formData.get(unitName(supplyId)) ?? ""),
    };
  });
}

export function countValues(entries: CountFormEntry[]) {
  return Object.fromEntries(entries.map((entry) => [entry.supplyId, entry.counted]));
}

// Avisos por ?aviso=... en la lista y en el conteo.
export const COUNT_LIST_NOTICES = {
  eliminado: "Borrador eliminado.",
} as const;

export const COUNT_NOTICES = {
  confirmado: "Conteo confirmado: las diferencias quedaron en el kardex de cada insumo.",
} as const;
