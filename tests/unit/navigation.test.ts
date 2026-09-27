import { describe, expect, it } from "vitest";

import {
  NAV_ITEMS,
  navHref,
  navigationFor,
} from "@/app/[empresa]/(panel)/navigation";
import { hasPermission } from "@/server/services/auth/permissions";

describe("navigationFor", () => {
  it("todos los roles ven Inicio", () => {
    for (const role of ["OWNER", "ADMIN", "STAFF"] as const) {
      expect(navigationFor(role).map((item) => item.id)).toContain("home");
    }
  });

  it("cada rol ve solo las secciones de sus permisos", () => {
    for (const role of ["OWNER", "ADMIN", "STAFF"] as const) {
      for (const item of navigationFor(role)) {
        expect(
          item.permission === null || hasPermission(role, item.permission),
        ).toBe(true);
      }
    }
  });

  it("los ids de las secciones no se repiten", () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("navHref", () => {
  it("arma la ruta dentro de la empresa", () => {
    expect(navHref("su-arepa", { path: "" })).toBe("/su-arepa");
    expect(navHref("su-arepa", { path: "configuracion/negocio" })).toBe(
      "/su-arepa/configuracion/negocio",
    );
  });
});
