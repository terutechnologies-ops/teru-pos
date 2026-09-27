import type { CompanyProfileField } from "@/server/services/companies";

// Compartido entre el formulario de datos del negocio (cliente) y las
// acciones que lo guardan (asistente y configuración).

export type ProfileFormValues = Record<CompanyProfileField, string>;

export type ProfileFormState = {
  status: "idle" | "error" | "saved";
  message: string | null;
  fieldErrors: Partial<Record<CompanyProfileField, string>>;
  values: ProfileFormValues;
};

export type SaveProfileAction = (
  prev: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;

export function readProfileForm(formData: FormData): ProfileFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    taxId: field("taxId"),
    phone: field("phone"),
    email: field("email"),
    address: field("address"),
    currency: field("currency"),
    dateFormat: field("dateFormat"),
  };
}

// Valores del formulario a partir de lo guardado (null → campo vacío).
export function toProfileFormValues(
  profile: Record<CompanyProfileField, string | null>,
): ProfileFormValues {
  return {
    name: profile.name ?? "",
    taxId: profile.taxId ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    address: profile.address ?? "",
    currency: profile.currency ?? "",
    dateFormat: profile.dateFormat ?? "",
  };
}

export function initialProfileState(values: ProfileFormValues): ProfileFormState {
  return { status: "idle", message: null, fieldErrors: {}, values };
}

// Estado de error para las acciones a partir del resultado del servicio.
export function profileErrorState(
  values: ProfileFormValues,
  fieldErrors?: ProfileFormState["fieldErrors"],
): ProfileFormState {
  return fieldErrors
    ? { status: "error", message: "Revisa los campos marcados.", fieldErrors, values }
    : {
        status: "error",
        message: "No pudimos guardar los datos. Inténtalo de nuevo en un momento.",
        fieldErrors: {},
        values,
      };
}
