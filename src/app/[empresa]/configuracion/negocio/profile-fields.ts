import type { CompanyProfileField } from "@/server/services/companies";

// Compartido entre el formulario (cliente) y su acción (servidor).

// Valor del radio "Otra moneda": la moneda sale entonces del selector con
// la lista completa.
export const OTHER_CURRENCY = "OTRA";

export type ProfileFormValues = Record<CompanyProfileField, string>;

export type ProfileFormState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  fieldErrors: Partial<Record<CompanyProfileField, string>>;
  values: ProfileFormValues;
};
