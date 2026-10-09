import type { Metadata } from "next";
import { redirect } from "next/navigation";

import logoTeru from "@/assets/brand/logo-teru.png";
import { AuthShell } from "@/components/shared/auth-shell";
import { PLATFORM_NAME } from "@/lib/brand";
import { getCurrentPlatformSession } from "@/server/http/platform-session";

import { PlatformLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Equipo Teru",
  robots: { index: false },
};

// Acceso del equipo Teru al panel de la plataforma. Con una sesión abierta
// va directo al panel.
export default async function PlatformLoginPage() {
  if (await getCurrentPlatformSession()) redirect("/teru");

  return (
    <AuthShell
      companyName={PLATFORM_NAME}
      logoUrl={logoTeru.src}
      eyebrow="Equipo Teru"
      title="Panel de la plataforma"
      description="Ingresa con tu cuenta del equipo Teru."
    >
      <PlatformLoginForm />
    </AuthShell>
  );
}
