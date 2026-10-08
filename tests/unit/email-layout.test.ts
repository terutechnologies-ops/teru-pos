import { describe, expect, it } from "vitest";

import { simpleEmail } from "@/server/services/messaging/email-layout";

const base = {
  title: "Asunto",
  preheader: "Vista previa",
  header: { companyName: "Su Arepa", logoUrl: null, eyebrow: "Invitación al equipo" },
  greeting: "Hola Ana,",
  paragraphs: ["Texto."],
  action: { href: "https://pos.teruwork.com/su-arepa/invitacion?token=t", label: "Aceptar" },
  note: "Nota.",
};

describe("simpleEmail", () => {
  it("sin datos clave no muestra el bloque", () => {
    expect(simpleEmail(base)).not.toContain("Tu acceso");
  });

  it("muestra los datos clave escapados, con enlace cuando lo hay", () => {
    const html = simpleEmail({
      ...base,
      details: {
        title: "Tu acceso",
        rows: [
          { label: "Correo", value: "<b>ana@x.co</b>" },
          { label: "Inicio de sesión", value: "https://pos.teruwork.com/su-arepa/login", href: "https://pos.teruwork.com/su-arepa/login" },
        ],
      },
    });
    expect(html).toContain("Tu acceso");
    expect(html).toContain("&lt;b&gt;ana@x.co&lt;/b&gt;");
    expect(html).not.toContain("<b>ana@x.co</b>");
    expect(html).toContain('<a href="https://pos.teruwork.com/su-arepa/login"');
    // El bloque va después del botón: la acción principal queda arriba.
    expect(html.indexOf("Tu acceso")).toBeGreaterThan(html.indexOf(">Aceptar</a>"));
  });
});
