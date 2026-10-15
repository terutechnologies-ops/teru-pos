import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import logoTeru from "@/assets/brand/logo-teru.png";
import { VerifyForm } from "@/components/platform/verify-form";
import { AuthShell } from "@/components/shared/auth-shell";
import { PLATFORM_NAME } from "@/lib/brand";
import {
  getCurrentPlatformChallenge,
  getCurrentPlatformSession,
  PLATFORM_ENROLL_PATH,
  PLATFORM_LOGIN_PATH,
} from "@/server/http/platform-session";

import { platformLogoutAction } from "../(panel)/actions";

export const metadata: Metadata = {
  title: "Verificación · Equipo Teru",
  robots: { index: false },
};

// Segundo paso del ingreso: el código de la app autenticadora o un código
// de respaldo (?respaldo=1).
export default async function PlatformVerifyPage({ searchParams }: PageProps<"/teru/verificar">) {
  if (await getCurrentPlatformSession()) redirect("/teru");
  const challenge = await getCurrentPlatformChallenge();
  if (!challenge) redirect(PLATFORM_LOGIN_PATH);
  if (!challenge.enrolled) redirect(PLATFORM_ENROLL_PATH);
  const recovery = (await searchParams).respaldo === "1";

  return (
    <AuthShell
      companyName={PLATFORM_NAME}
      logoUrl={logoTeru.src}
      icon={<ShieldCheck aria-hidden />}
      eyebrow="Equipo Teru"
      title="Verificación en dos pasos"
      description={
        recovery
          ? "Escribe uno de los códigos de respaldo que guardaste al activar la verificación."
          : `Abre tu app autenticadora y escribe el código de ${PLATFORM_NAME} (${challenge.user.email}).`
      }
      footer={
        <form action={platformLogoutAction}>
          <button type="submit" className="font-semibold text-link hover:underline">
            Usar otra cuenta
          </button>
        </form>
      }
    >
      <VerifyForm key={recovery ? "respaldo" : "app"} recovery={recovery} />
    </AuthShell>
  );
}
