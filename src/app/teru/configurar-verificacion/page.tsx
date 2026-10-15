import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import logoTeru from "@/assets/brand/logo-teru.png";
import { EnrollForm } from "@/components/platform/enroll-form";
import { AuthShell } from "@/components/shared/auth-shell";
import { PLATFORM_NAME } from "@/lib/brand";
import {
  getCurrentPlatformChallenge,
  getCurrentPlatformSession,
  PLATFORM_LOGIN_PATH,
  PLATFORM_VERIFY_PATH,
  readPlatformSessionToken,
} from "@/server/http/platform-session";
import { startPlatformEnrollment } from "@/server/services/platform/auth";

import { platformLogoutAction } from "../(panel)/actions";

export const metadata: Metadata = {
  title: "Activar verificación · Equipo Teru",
  robots: { index: false },
};

// Activación obligatoria de la verificación en dos pasos (la primera vez, o
// después de reiniciarla con el script): QR o clave, y el primer código.
export default async function PlatformEnrollPage() {
  if (await getCurrentPlatformSession()) redirect("/teru");
  const challenge = await getCurrentPlatformChallenge();
  if (!challenge) redirect(PLATFORM_LOGIN_PATH);
  if (challenge.enrolled) redirect(PLATFORM_VERIFY_PATH);
  const enrollment = await startPlatformEnrollment(await readPlatformSessionToken());
  if (!enrollment) redirect(PLATFORM_LOGIN_PATH);

  return (
    <AuthShell
      companyName={PLATFORM_NAME}
      logoUrl={logoTeru.src}
      icon={<ShieldCheck aria-hidden />}
      eyebrow="Equipo Teru"
      title="Activa la verificación en dos pasos"
      description="Tu cuenta controla todas las empresas: además de la contraseña, pediremos un código de tu teléfono."
      footer={
        <form action={platformLogoutAction}>
          <button type="submit" className="font-semibold text-link hover:underline">
            Usar otra cuenta
          </button>
        </form>
      }
    >
      <ol className="mb-6 flex flex-col gap-4 text-sm print:hidden">
        <li>
          <span className="font-bold">1.</span> Instala una app autenticadora en tu teléfono: Google
          Authenticator, Microsoft Authenticator o 1Password.
        </li>
        <li className="flex flex-col gap-3">
          <span>
            <span className="font-bold">2.</span> En la app, agrega una cuenta y escanea este código:
          </span>
          {/* SVG generado en el servidor a partir del enlace otpauth (sin datos del usuario más que el correo). */}
          <div
            className="mx-auto size-44 rounded-xl bg-white p-2 [&>svg]:size-full"
            role="img"
            aria-label={`Código QR para agregar ${PLATFORM_NAME} a la app autenticadora`}
            dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
          />
          <span className="text-muted-foreground">
            ¿No puedes escanearlo? Escribe esta clave en la app (tipo &quot;basada en el tiempo&quot;):
          </span>
          <code className="rounded-lg bg-muted px-3 py-2 text-center font-mono text-sm font-semibold tracking-wider break-all select-all">
            {enrollment.secret}
          </code>
        </li>
        <li>
          <span className="font-bold">3.</span> Escribe el código de 6 dígitos que aparece en la app.
        </li>
      </ol>
      <EnrollForm />
    </AuthShell>
  );
}
