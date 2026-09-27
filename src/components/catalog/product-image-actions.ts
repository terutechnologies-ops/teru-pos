"use server";

import { refresh } from "next/cache";

import type { ImageFormState } from "@/components/shared/image-upload-fields";
import {
  getRequestContext,
  requirePermission,
} from "@/server/http/staff-session";
import {
  removeProductImage,
  updateProductImage,
  type CatalogResult,
} from "@/server/services/catalog";

const UNEXPECTED = "No pudimos guardar la foto. Inténtalo de nuevo en un momento.";

async function run(
  formData: FormData,
  label: string,
  saved: string,
  action: (
    session: Awaited<ReturnType<typeof requirePermission>>,
    productId: string,
  ) => Promise<CatalogResult>,
): Promise<ImageFormState> {
  // requirePermission valida la sesión en la empresa enviada y el permiso.
  const session = await requirePermission(
    String(formData.get("company") ?? ""),
    "catalog.manage",
  );
  let result: CatalogResult;
  try {
    result = await action(session, String(formData.get("id") ?? ""));
  } catch (error) {
    console.error(`${label}: error inesperado`, (error as Error).message);
    return { status: "error", message: UNEXPECTED };
  }
  if (!result.ok) return { status: "error", message: result.error };
  refresh();
  return { status: "saved", message: saved };
}

export async function uploadProductImageAction(
  _prev: ImageFormState,
  formData: FormData,
): Promise<ImageFormState> {
  const file = formData.get("image");
  return run(formData, "uploadProductImageAction", "Foto actualizada.", async (session, id) =>
    updateProductImage(session, id, file instanceof Blob ? file : null, await getRequestContext()),
  );
}

export async function removeProductImageAction(
  _prev: ImageFormState,
  formData: FormData,
): Promise<ImageFormState> {
  return run(formData, "removeProductImageAction", "Foto quitada.", async (session, id) =>
    removeProductImage(session, id, await getRequestContext()),
  );
}
