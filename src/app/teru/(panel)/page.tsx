import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Empresas · Equipo Teru",
  robots: { index: false },
};

// Inicio del panel del equipo Teru: las empresas de la plataforma (la lista
// y sus indicadores llegan en el componente 3 de la fase 13).
export default function PlatformHomePage() {
  return (
    <PageHeader
      eyebrow="Plataforma"
      title="Empresas"
      description="Las empresas que usan Teru POS."
    />
  );
}
