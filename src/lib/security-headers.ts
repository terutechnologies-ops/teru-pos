// Cabeceras de seguridad de todas las respuestas (next.config.ts). Puro:
// recibe el entorno para poder probarlo.

type SecurityHeadersOptions = {
  isDev: boolean;
  // Orígenes de donde se cargan imágenes además del propio sitio: Supabase
  // Storage (fotos y logos) y APP_URL (archivos locales de desarrollo, que
  // pueden abrirse desde otra dirección, p. ej. la IP de la red).
  imageUrls: (string | undefined)[];
};

function origins(urls: (string | undefined)[]): string[] {
  const result = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    try {
      result.add(new URL(url).origin);
    } catch {
      // Una variable mal escrita no debe tumbar el build; la valida env.ts.
    }
  }
  return [...result];
}

// Sin nonce: los scripts en línea de Next siguen permitidos, a cambio de no
// volver dinámicas todas las páginas. Lo que sí cierra: recursos de otros
// sitios, plugins, <base>, formularios hacia afuera y que otro sitio
// enmarque la app. 'self' en frame-ancestors (no 'none'): el POS imprime la
// comanda en un iframe oculto de la propia app.
export function contentSecurityPolicy({ isDev, imageUrls }: SecurityHeadersOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' blob: data:", ...origins(imageUrls)].join(" "),
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // En local se prueba por http (también desde la IP de la red).
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function securityHeaders(options: SecurityHeadersOptions) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      // Solo funciones que todos los navegadores reconocen: una desconocida
      // (p. ej. browsing-topics) deja un aviso en la consola.
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    // Solo en producción: por http el navegador la ignora y en local no
    // aporta. Dos años, sin preload (la decisión es del dominio completo).
    ...(options.isDev
      ? []
      : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
