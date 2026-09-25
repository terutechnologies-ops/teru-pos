import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { RequestContext } from "@/server/dto/auth";
import {
  hasPermission,
  type Permission,
} from "@/server/services/auth/permissions";
import { getStaffSession } from "@/server/services/auth/staff-auth";

// Adaptador entre Next (cookies, cabeceras, redirecciones) y los servicios
// de autenticación, que no dependen del framework.

export const STAFF_SESSION_COOKIE = "staff_session";

// La cookie se limita a la ruta de la empresa (/su-arepa): el navegador no la
// envía a otras empresas y permite tener sesiones en varias a la vez.
function cookiePath(companySlug: string) {
  return `/${companySlug}`;
}

export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  // Depende de que el proxy/hosting de producción sobrescriba estas
  // cabeceras; revisar al definir la infraestructura.
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
  };
}

export async function setStaffSessionCookie(params: {
  companySlug: string;
  token: string;
  persistent: boolean;
  expiresAt: Date;
}) {
  const store = await cookies();
  store.set(STAFF_SESSION_COOKIE, params.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath(params.companySlug),
    // Sin "recordar": cookie de sesión del navegador (sin expires).
    ...(params.persistent ? { expires: params.expiresAt } : {}),
  });
}

export async function readStaffSessionToken(): Promise<string> {
  return (await cookies()).get(STAFF_SESSION_COOKIE)?.value ?? "";
}

export async function clearStaffSessionCookie(companySlug: string) {
  (await cookies()).delete({
    name: STAFF_SESSION_COOKIE,
    path: cookiePath(companySlug),
  });
}

// cache(): una sola consulta por request aunque la llamen layout y página.
export const getCurrentStaffSession = cache(async (companySlug: string) => {
  const token = await readStaffSessionToken();
  const result = await getStaffSession(companySlug, token);
  return result?.session ?? null;
});

export async function requireStaffSession(companySlug: string) {
  const session = await getCurrentStaffSession(companySlug);
  if (!session) redirect(`/${encodeURIComponent(companySlug)}/login`);
  return session;
}

// Sin permiso redirige al panel en lugar de usar forbidden(), que en Next 16
// sigue siendo experimental (experimental.authInterrupts).
export async function requirePermission(
  companySlug: string,
  permission: Permission,
) {
  const session = await requireStaffSession(companySlug);
  if (!hasPermission(session.user.role, permission)) {
    redirect(`/${encodeURIComponent(session.company.slug)}`);
  }
  return session;
}
