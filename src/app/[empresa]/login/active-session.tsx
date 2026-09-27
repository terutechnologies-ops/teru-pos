import Link from "next/link";
import { ArrowRight, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

import { logoutAction } from "../(panel)/actions";

// Se muestra en el login cuando ya hay una sesión abierta en esta empresa
// (p. ej. se llegó desde "Volver a iniciar sesión"). Redirigir en silencio
// dejaba a la persona sin forma de entrar con otra cuenta.
export function ActiveSession({
  companySlug,
  user,
}: {
  companySlug: string;
  user: { name: string; email: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-muted px-4 py-3 text-sm">
        <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Sesión abierta
        </span>
        <span className="block font-semibold">{user.name}</span>
        <span className="block break-all text-muted-foreground">{user.email}</span>
      </div>
      <Button
        asChild
        className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        <Link href={`/${companySlug}`}>
          Continuar
          <ArrowRight aria-hidden />
        </Link>
      </Button>
      <form action={logoutAction.bind(null, companySlug)}>
        <Button
          type="submit"
          variant="outline"
          className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold"
        >
          <LogOut aria-hidden />
          Cerrar sesión y usar otra cuenta
        </Button>
      </form>
    </div>
  );
}
