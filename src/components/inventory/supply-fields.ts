import type { SupplyAlert, SupplyField } from "@/server/services/inventory";

// Compartido entre el formulario de insumos (cliente) y sus acciones
// (servidor).

export type SupplyFormValues = Record<SupplyField, string>;

export type SupplyFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<SupplyField, string>>;
  values: SupplyFormValues;
};

export type SaveSupplyAction = (
  prev: SupplyFormState,
  formData: FormData,
) => Promise<SupplyFormState>;

export function readSupplyForm(formData: FormData): SupplyFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    unit: field("unit"),
    minStock: field("minStock"),
    idealStock: field("idealStock"),
    unitCost: field("unitCost"),
  };
}

// Avisos de la lista por ?aviso=...
export const SUPPLY_NOTICES = {
  creado: "Insumo creado.",
  guardado: "Cambios guardados.",
} as const;

// Textos de cada alerta: insignia de la lista, tarjeta del inicio y lista
// filtrada sin resultados.
export const SUPPLY_ALERT_INFO: Record<
  SupplyAlert,
  { badge: string; title: string; hint: string; empty: string }
> = {
  "saldo-negativo": {
    badge: "Saldo negativo",
    title: "Insumos con saldo negativo",
    hint: "Se vendió más de lo registrado: faltan entradas por registrar.",
    empty: "Ningún insumo tiene saldo negativo.",
  },
  "sin-carga": {
    badge: "Sin carga inicial",
    title: "Insumos sin carga inicial",
    hint: "Registra cuánto tienes para que las ventas lo descuenten.",
    empty: "Todos los insumos tienen su carga inicial.",
  },
  "bajo-minimo": {
    badge: "Bajo mínimo",
    title: "Insumos bajo mínimo",
    hint: "Su existencia está por debajo del mínimo que definiste.",
    empty: "Ningún insumo está bajo su mínimo.",
  },
};
