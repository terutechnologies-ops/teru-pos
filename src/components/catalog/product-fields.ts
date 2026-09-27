import type { ProductField, ProductFormField } from "@/server/services/catalog";

// Compartido entre los formularios de productos (cliente) y sus acciones
// (servidor).

export type ProductFormValues = Record<ProductField, string>;

export type ProductFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Partial<Record<ProductFormField, string>>;
  values: ProductFormValues;
  // Se había elegido una foto: el navegador la descarta al reiniciar el
  // formulario, así que hay que pedir que la elijan de nuevo.
  imageDropped?: boolean;
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

// Avisos por ?aviso=... En la lista: creado y guardado. En la página del
// producto: sin-foto (se creó pero la foto no se pudo subir).
export const PRODUCT_NOTICES = {
  creado: "Producto creado.",
  guardado: "Cambios guardados.",
  "sin-foto": "Producto creado, pero no se pudo subir la foto. Inténtalo de nuevo aquí.",
} as const;
