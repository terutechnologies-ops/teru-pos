import { IMAGE_MAX_BYTES } from "@/lib/images";

// Solo en el navegador. Antes de subir: reduce la imagen a 1200 px de lado
// mayor y la vuelve a codificar. Así una foto de celular (3–5 MB) cabe en el
// límite de 1 MB y se eliminan sus metadatos (EXIF: ubicación GPS, modelo
// del teléfono). El servidor vuelve a validar todo.

const MAX_SIDE = 1200;

// WebP conserva transparencia y pesa poco; PNG la conserva donde WebP no
// está disponible; JPEG como último recurso para fotos grandes.
const OUTPUTS = [
  { type: "image/webp", ext: "webp", quality: 0.85 },
  { type: "image/png", ext: "png", quality: undefined },
  { type: "image/jpeg", ext: "jpg", quality: 0.85 },
] as const;

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

// Devuelve el archivo procesado, o el original si el navegador no puede
// leerlo (p. ej. HEIC): el servidor lo aceptará o explicará por qué no.
export async function prepareImageForUpload(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const base = file.name.replace(/\.[^.]*$/, "") || "imagen";
  for (const output of OUTPUTS) {
    const blob = await toBlob(canvas, output.type, output.quality);
    // Un navegador sin soporte para el tipo devuelve PNG: se comprueba.
    if (blob && blob.type === output.type && blob.size <= IMAGE_MAX_BYTES) {
      return new File([blob], `${base}.${output.ext}`, { type: output.type });
    }
  }
  return file;
}
