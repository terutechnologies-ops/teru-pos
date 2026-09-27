// Reglas del logo de la empresa (cliente y servidor).

export const LOGO_MAX_BYTES = 1024 * 1024;

// Sin SVG: puede llevar scripts.
export const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type LogoType = keyof typeof LOGO_TYPES;

// Para el atributo accept del campo de archivo.
export const LOGO_ACCEPT = Object.keys(LOGO_TYPES).join(",");

// Tipo real según los primeros bytes (no se confía en la extensión ni en el
// tipo que declara el navegador). null si no es PNG, JPEG ni WebP.
export function detectLogoType(bytes: Uint8Array): LogoType | null {
  const starts = (sig: number[], offset = 0) =>
    sig.every((byte, i) => bytes[offset + i] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" .... "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
