import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/server/http/staff-session";

import { logoutAction } from "../(panel)/actions";

export const metadata: Metadata = { title: "Configuración inicial" };

// Esqueleto protegido del asistente de configuración; los pasos llegan en
// los componentes siguientes de la fase 2.
export default async function SetupPage({
  params,
}: PageProps<"/[empresa]/configuracion">) {
  const { empresa } = await params;
  const { user, company } = await requirePermission(empresa, "company.setup");

  if (company.setupCompletedAt) redirect(`/${company.slug}`);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">{company.name}</h1>
        <form action={logoutAction.bind(null, company.slug)}>
          <Button type="submit" variant="outline" className="gap-2">
            <LogOut aria-hidden />
            Cerrar sesión
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Configuremos tu negocio, {user.name}</CardTitle>
          <CardDescription>
            El asistente de configuración estará disponible pronto.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
