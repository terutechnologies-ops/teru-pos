import type { ProductField } from "@/server/services/catalog";

// Compartido entre los formularios de productos (cliente) y sus acciones
// (servidor).

export type ProductFormValues = Record<ProductField, string>;

export type ProductFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<ProductField, string>>;
  values: ProductFormValues;
};

export type SaveProductAction = (
  prev: ProductFormState,
  formData: FormData,
) => Promise<ProductFormState>;

export function readProductForm(formData: FormData): ProductFormValues {
  const field = (name: string) => String(formData.get(name) ?? "");
  return {
    name: field("name"),
    categoryId: field("categoryId"),
    description: field("description"),
    price: field("price"),
  };
}

export const PRODUCT_INTENTS = ["archive", "restore", "soldout", "available"] as const;

export type ProductIntent = (typeof PRODUCT_INTENTS)[number];

export type ProductRowState = { error: string | null };

// Aviso en la lista tras crear o guardar (?aviso=...).
export const PRODUCT_NOTICES = {
  creado: "Producto creado.",
  guardado: "Cambios guardados.",
} as const;
