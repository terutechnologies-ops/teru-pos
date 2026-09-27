import { describe, expect, it } from "vitest";

import { detectLogoType } from "@/lib/company-logo";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("detectLogoType", () => {
  it("reconoce PNG, JPEG y WebP por su contenido", () => {
    expect(detectLogoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      "image/png",
    );
    expect(detectLogoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectLogoType(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("rechaza SVG, GIF, texto y archivos vacíos", () => {
    expect(detectLogoType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectLogoType(ascii("GIF89a"))).toBeNull();
    expect(detectLogoType(ascii("hola"))).toBeNull();
    expect(detectLogoType(new Uint8Array())).toBeNull();
    // RIFF que no es WebP (p. ej. WAV).
    expect(detectLogoType(ascii("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
  });
});
