import { NextResponse, type NextRequest } from "next/server";

// Solo redirección optimista: si no hay cookie de sesión en una ruta privada
// de empresa, envía al login. La validación real de la sesión y de los
// permisos ocurre en el servidor (requireStaffSession y servicios).

// Debe coincidir con STAFF_SESSION_COOKIE (src/server/http/staff-session.ts);
// no se importa porque ese módulo es server-only y depende de next/headers.
const STAFF_SESSION_COOKIE = "staff_session";

// Subrutas de empresa accesibles sin sesión.
const PUBLIC_COMPANY_PATHS = new Set(["login"]);

export function proxy(request: NextRequest) {
  const [companySlug, section] = request.nextUrl.pathname
    .split("/")
    .filter(Boolean);

  if (!companySlug || (section && PUBLIC_COMPANY_PATHS.has(section))) {
    return NextResponse.next();
  }

  if (!request.cookies.has(STAFF_SESSION_COOKIE)) {
    const loginUrl = new URL(`/${companySlug}/login`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Excluye internos de Next, API y archivos estáticos (con extensión).
  matcher: ["/((?!_next/|api/|.*\..*).*)"],
};
