import { describe, expect, it } from "vitest";

import {
  companySlugSchema,
  passwordResetSchema,
  staffLoginSchema,
} from "@/server/validations/auth";

describe("companySlugSchema", () => {
  it("normaliza a minúsculas y acepta guiones", () => {
    expect(companySlugSchema.parse(" Su-Arepa ")).toBe("su-arepa");
  });

  it.each(["dev", "api", "_next", "su arepa", "-x", "a--b", "$$$", ""])(
    "rechaza %j",
    (slug) => {
      expect(companySlugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe("staffLoginSchema", () => {
  it("normaliza el correo y por defecto no recuerda la sesión", () => {
    expect(
      staffLoginSchema.parse({ email: "  ANA@Correo.CO ", password: "x" }),
    ).toEqual({ email: "ana@correo.co", password: "x", remember: false });
  });

  it("rechaza correo inválido y contraseña vacía o enorme", () => {
    const bad = [
      { email: "no-es-email", password: "x" },
      { email: "a@b.co", password: "" },
      { email: "a@b.co", password: "x".repeat(201) },
    ];
    for (const input of bad) {
      expect(staffLoginSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("passwordResetSchema", () => {
  const token = "t".repeat(43);

  it("exige mínimo 8 caracteres y que coincida la confirmación", () => {
    expect(
      passwordResetSchema.safeParse({
        token,
        password: "corta",
        confirmPassword: "corta",
      }).success,
    ).toBe(false);
    expect(
      passwordResetSchema.safeParse({
        token,
        password: "Clave-Nueva-1",
        confirmPassword: "otra",
      }).success,
    ).toBe(false);
    expect(
      passwordResetSchema.safeParse({
        token,
        password: "Clave-Nueva-1",
        confirmPassword: "Clave-Nueva-1",
      }).success,
    ).toBe(true);
  });
});
