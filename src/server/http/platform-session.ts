import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getPlatformSession } from "@/server/services/platform/auth";

// Adaptador de Next para la sesión del equipo Teru (panel /teru).

export const PLATFORM_SESSION_COOKIE = "teru_session";

// Solo se envía a /teru: nunca viaja a las rutas de las empresas.
const COOKIE_PATH = "/teru";

export const PLATFORM_LOGIN_PATH = "/teru/login";

// Sin expires: cookie de sesión del navegador (no hay "recordar"). La
// sesión vence en el servidor a las 8 h sin uso.
export async function setPlatformSessionCookie(token: string) {
  (await cookies()).set(PLATFORM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
  });
}

export async function readPlatformSessionToken(): Promise<string> {
  return (await cookies()).get(PLATFORM_SESSION_COOKIE)?.value ?? "";
}

export async function clearPlatformSessionCookie() {
  (await cookies()).delete({ name: PLATFORM_SESSION_COOKIE, path: COOKIE_PATH });
}

// cache(): una sola consulta por request aunque la llamen layout y página.
export const getCurrentPlatformSession = cache(async () =>
  getPlatformSession(await readPlatformSessionToken()),
);

export async function requirePlatformSession() {
  const session = await getCurrentPlatformSession();
  if (!session) redirect(PLATFORM_LOGIN_PATH);
  return session;
}
