import type { Metadata } from "next";

import { AccountSections } from "@/components/account/account-sections";
import { PageHeader } from "@/components/shared/page-header";
import { requireStaffSession } from "@/server/http/staff-session";

export const metadata: Metadata = { title: "Mi cuenta" };

// Cualquier rol con sesión (el cajero, que no entra al panel, la tiene en
// /pos/cuenta).
export default async function AccountPage({ params }: PageProps<"/[empresa]/cuenta">) {
  const { empresa } = await params;
  const session = await requireStaffSession(empresa);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader eyebrow="Cuenta" title="Mi cuenta" description="Tus datos y tu contraseña." />
      <AccountSections session={session} />
    </div>
  );
}
