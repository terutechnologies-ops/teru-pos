import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";

import logoTeru from "@/assets/brand/logo-teru.png";
import { Button } from "@/components/ui/button";
import { PLATFORM_NAME } from "@/lib/brand";
import { requirePlatformSession } from "@/server/http/platform-session";

import { platformLogoutAction } from "./actions";

// Panel del equipo Teru. El proxy solo redirige cuando falta la cookie; aquí
// se valida la sesión de verdad (y cada servicio la vuelve a pedir).
export default async function PlatformPanelLayout({ children }: LayoutProps<"/teru">) {
  const { user } = await requirePlatformSession();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-10 bg-brand text-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link href="/teru" className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white p-1">
              <Image src={logoTeru} alt="" className="size-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold">{PLATFORM_NAME}</span>
              <span className="block text-[11px] font-bold tracking-widest text-highlight uppercase">
                Equipo Teru
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right text-sm sm:block">
              <span className="block font-semibold">{user.name}</span>
              <span className="block text-xs text-white/70">{user.email}</span>
            </span>
            <form action={platformLogoutAction}>
              <Button
                type="submit"
                variant="ghost"
                className="gap-2 text-white hover:bg-white/10 hover:text-white"
              >
                <LogOut aria-hidden />
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
        {children}
      </main>
    </div>
  );
}
