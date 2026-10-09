import type { NewCompanyField } from "@/server/services/platform/companies";

// Estados de los formularios del panel Teru (fuera del archivo "use server",
// que solo puede exportar funciones async).

export type NewCompanyValues = Record<NewCompanyField, string>;

export type NewCompanyFormState = {
  error: string | null;
  fieldErrors: Partial<Record<NewCompanyField, string>>;
  values: NewCompanyValues;
};

export const initialNewCompanyState: NewCompanyFormState = {
  error: null,
  fieldErrors: {},
  values: { name: "", slug: "", ownerName: "", ownerEmail: "" },
};

export type ResendWelcomeState = { error: string | null };
