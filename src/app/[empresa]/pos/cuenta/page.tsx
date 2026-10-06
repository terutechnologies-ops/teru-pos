import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AccountSections } from "@/components/account/account-sections";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/http/staff-session";

export const metadata: Metadata = { title: "Mi cuenta" };

// "Mi cuenta" dentro del POS: el cajero no entra al panel.
export default async function PosAccountPage({ params }: PageProps<"/[empresa]/pos/cuenta">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "sales.charge");
  const slug = session.company.slug;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="gap-2 self-start">
        <Link href={`/${slug}/pos`}>
          <ArrowLeft aria-hidden />
          Volver a vender
        </Link>
      </Button>
      <h1 className="text-2xl font-extrabold tracking-tight">Mi cuenta</h1>
      <AccountSections session={session} />
    </div>
  );
}
