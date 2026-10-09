import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewCompanyForm } from "@/components/platform/new-company-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePlatformSession } from "@/server/http/platform-session";

export const metadata: Metadata = {
  title: "Nueva empresa · Equipo Teru",
  robots: { index: false },
};

export default async function NewPlatformCompanyPage() {
  await requirePlatformSession();
  return (
    <>
      <Link href="/teru" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        Empresas
      </Link>
      <PageHeader
        eyebrow="Plataforma"
        title="Nueva empresa"
        description="Crea la empresa y envía la bienvenida a su propietario."
      />
      <section className="max-w-3xl rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <NewCompanyForm />
      </section>
    </>
  );
}
