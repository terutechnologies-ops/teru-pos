import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import { assertProductionConfig, getProductionConfigProblems } from "@/server/env";

afterEach(() => vi.unstubAllEnvs());

function header(headers: { key: string; value: string }[], key: string) {
  return headers.find((h) => h.key === key)?.value;
}

describe("cabeceras de seguridad", () => {
  it("en producción: HSTS, sin eval, https forzado y orígenes de imágenes", () => {
    const headers = securityHeaders({
      isDev: false,
      imageUrls: ["https://abc.supabase.co", "https://pos.teruwork.com/", "no es url", undefined],
    });
    const csp = header(headers, "Content-Security-Policy")!;
    expect(csp).toContain("img-src 'self' blob: data: https://abc.supabase.co https://pos.teruwork.com;");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(header(headers, "Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(header(headers, "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(header(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(headers, "Permissions-Policy")).toContain("camera=()");
  });

  it("en desarrollo: eval para React, sin HSTS ni upgrade", () => {
    const headers = securityHeaders({ isDev: true, imageUrls: ["http://localhost:3000"] });
    const csp = contentSecurityPolicy({ isDev: true, imageUrls: ["http://localhost:3000"] });
    expect(header(headers, "Content-Security-Policy")).toBe(csp);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("http://localhost:3000");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(header(headers, "Strict-Transport-Security")).toBeUndefined();
  });
});

describe("configuración de producción", () => {
  function stubValid() {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example.com:6543/postgres");
    vi.stubEnv("APP_URL", "https://pos.teruwork.com");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("RESEND_API_KEY", "re_prueba");
    vi.stubEnv("MAIL_FROM", "Teru POS <reportes@envios.teruwork.com>");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_prueba");
  }

  it("completa no reporta problemas", () => {
    stubValid();
    expect(getProductionConfigProblems()).toEqual([]);
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("reporta cada variable faltante o inválida sin mostrar valores", () => {
    stubValid();
    vi.stubEnv("DATABASE_URL", "mysql://secreto@db");
    vi.stubEnv("APP_URL", "http://pos.teruwork.com");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "corta");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const problems = getProductionConfigProblems();
    expect(problems).toEqual([
      "DATABASE_URL no está configurada o no es una conexión de PostgreSQL",
      "APP_URL debe usar https",
      "TOTP_ENCRYPTION_KEY no está configurada o no es válida (32 bytes en base64)",
      "RESEND_API_KEY no está configurada (sin ella no salen los correos)",
      "SUPABASE_URL o SUPABASE_SECRET_KEY no están configuradas (sin ellas no se suben imágenes)",
    ]);
    expect(problems.join(" ")).not.toContain("secreto");
    expect(() => assertProductionConfig()).toThrow(/Configuración incompleta para producción:\n- DATABASE_URL/);
  });

  it("detecta APP_URL ausente y remitente inválido", () => {
    stubValid();
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("MAIL_FROM", "sin arroba");
    expect(getProductionConfigProblems()).toEqual([
      "APP_URL no está configurada",
      "MAIL_FROM no está configurado o no es válido",
    ]);
  });
});
