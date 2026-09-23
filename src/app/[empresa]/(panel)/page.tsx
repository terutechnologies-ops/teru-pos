import type { Metadata } from "next";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireStaffSession } from "@/server/http/staff-session";

import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Panel" };

const ROLE_LABELS = { OWNER: "Propietario", ADMIN: "Administrador", STAFF: "Personal" };

// Panel provisional: solo confirma que la sesión funciona. Los módulos de
// negocio llegarán en fases posteriores.
export default async function PanelPage({ params }: PageProps<"/[empresa]">) {
  const { empresa } = await params;
  const { user, company } = await requireStaffSession(empresa);

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
          <CardTitle>Hola, {user.name}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {user.email}
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
