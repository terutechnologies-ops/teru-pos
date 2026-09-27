"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import {
  getRequestContext,
  requirePermission,
} from "@/server/http/staff-session";
import {
  createCatalogProduct,
  setCatalogProductArchived,
  setCatalogProductAvailable,
  updateCatalogProduct,
  type CatalogResult,
  type SaveProductResult,
} from "@/server/services/catalog";

import {
  PRODUCT_INTENTS,
  readProductForm,
  type ProductFormState,
  type ProductIntent,
  type ProductRowState,
} from "./product-fields";

const UNEXPECTED = "No pudimos completar la acción. Inténtalo de nuevo en un momento.";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

// requirePermission valida la sesión en la empresa enviada y el permiso.
function sessionFrom(formData: FormData) {
  return requirePermission(field(formData, "company"), "catalog.manage");
}

async function saveProduct(
  formData: FormData,
  label: string,
  notice: "creado" | "guardado",
  save: (
    session: Awaited<ReturnType<typeof sessionFrom>>,
    values: ReturnType<typeof readProductForm>,
  ) => Promise<SaveProductResult>,
): Promise<ProductFormState> {
  const session = await sessionFrom(formData);
  const values = readProductForm(formData);
  const image = formData.get("image");
  const imageDropped = image instanceof Blob && image.size > 0;
  let result: SaveProductResult;
  try {
    result = await save(session, values);
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).name);
    return { status: "error", message: UNEXPECTED, fieldErrors: {}, values, imageDropped };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: result.error ?? "Revisa los campos marcados.",
      fieldErrors: result.fieldErrors,
      values,
      imageDropped,
    };
  }
  const base = `/${session.company.slug}/catalogo/productos`;
  // Si la foto falló, se abre el producto para reintentarla.
  if (result.imageFailed) redirect(`${base}/${result.productId}?aviso=sin-foto`);
  redirect(`${base}?aviso=${notice}`);
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const image = formData.get("image");
  return saveProduct(formData, "createProductAction", "creado", async (session, values) =>
    createCatalogProduct(
      session,
      values,
      await getRequestContext(),
      image instanceof Blob ? image : null,
    ),
  );
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  return saveProduct(formData, "updateProductAction", "guardado", async (session, values) =>
    updateCatalogProduct(session, field(formData, "id"), values, await getRequestContext()),
  );
}

function isIntent(value: string): value is ProductIntent {
  return (PRODUCT_INTENTS as readonly string[]).includes(value);
}

// Botones de cada fila: agotado/disponible y archivar/restaurar.
export async function productRowAction(
  _prev: ProductRowState,
  formData: FormData,
): Promise<ProductRowState> {
  const session = await sessionFrom(formData);
  const intent = field(formData, "intent");
  const id = field(formData, "id");
  if (!isIntent(intent) || !id) return { error: UNEXPECTED };

  let result: CatalogResult;
  try {
    const ctx = await getRequestContext();
    result =
      intent === "archive" || intent === "restore"
        ? await setCatalogProductArchived(session, id, intent === "archive", ctx)
        : await setCatalogProductAvailable(session, id, intent === "available", ctx);
  } catch (error) {
    console.error("productRowAction: error inesperado", (error as Error).name);
    return { error: UNEXPECTED };
  }
  refresh();
  return { error: result.ok ? null : result.error };
}
