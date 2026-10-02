import { describe, expect, it } from "vitest";

import { withQuery } from "@/lib/utils";

describe("withQuery", () => {
  it("omite los parámetros vacíos y codifica los valores", () => {
    expect(withQuery("/x/insumos", { q: "", alerta: "" })).toBe("/x/insumos");
    expect(withQuery("/x/insumos", { q: "pan dulce", alerta: "sin-carga" })).toBe(
      "/x/insumos?q=pan+dulce&alerta=sin-carga",
    );
  });
});
