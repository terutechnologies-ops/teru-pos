import type { Metadata } from "next";

import { PLATFORM_NAME } from "@/lib/brand";
import { getRequestCompany } from "@/server/http/company";

// Títulos de pestaña: "Página · Empresa · Teru POS".
export async function generateMetadata({
  params,
}: LayoutProps<"/[empresa]">): Promise<Metadata> {
  const { empresa } = await params;
  const company = await getRequestCompany(empresa);
  if (!company) return {};
  return {
    title: {
      template: `%s · ${company.name} · ${PLATFORM_NAME}`,
      // La plantilla raíz le agrega " · Teru POS".
      default: company.name,
    },
  };
}

export default function CompanyLayout({ children }: LayoutProps<"/[empresa]">) {
  return children;
}
