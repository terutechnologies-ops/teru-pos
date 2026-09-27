import type { CompanyProfileField } from "@/server/services/companies";

// Compartido entre el formulario (cliente) y su acción (servidor).

export type ProfileFormValues = Record<CompanyProfileField, string>;

export type ProfileFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<CompanyProfileField, string>>;
  values: ProfileFormValues;
};
