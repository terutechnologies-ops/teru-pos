"use client";

import { CompanyMark } from "@/components/shared/company-mark";
import { ImageUploadCard } from "@/components/shared/image-upload-card";

import { removeLogoAction, uploadLogoAction } from "./logo-actions";

// Logo de la empresa (asistente y configuración).
export function CompanyLogoCard({
  companySlug,
  companyName,
  logoUrl,
}: {
  companySlug: string;
  companyName: string;
  logoUrl: string | null;
}) {
  return (
    <ImageUploadCard
      title="Logo"
      description="Aparece en el inicio de sesión y en el menú. PNG, JPG o WebP; mejor cuadrado y con fondo transparente."
      preview={
        // Sobre el morado oscuro, como se verá en el acceso.
        <span className="flex items-center justify-center rounded-2xl bg-brand p-3">
          <CompanyMark logoUrl={logoUrl} companyName={companyName} size="lg" />
        </span>
      }
      hasImage={Boolean(logoUrl)}
      hiddenFields={{ company: companySlug }}
      uploadAction={uploadLogoAction}
      removeAction={removeLogoAction}
      labels={{ upload: "Subir logo", change: "Cambiar logo", remove: "Quitar logo" }}
    />
  );
}
