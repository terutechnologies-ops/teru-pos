import Image from "next/image";

import logoTeru from "@/assets/brand/logo-teru.png";
import { PLATFORM_NAME } from "@/lib/brand";

import { CompanyFinder } from "./company-finder";

// Raíz de la plataforma: la persona escribe su empresa y llega a su login.
// Es la única vista con el logo de Teru POS; dentro de cada empresa se usa
// su propia identidad. No lista empresas.
export default function HomePage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-brand">
      <div className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-primary/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 size-[30rem] rounded-full bg-primary/25 blur-[140px]" />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[480px] rounded-[28px] border border-white/20 bg-white/10 p-2.5 shadow-2xl backdrop-blur-md sm:p-3">
          <div className="flex flex-col items-center gap-6 rounded-[20px] bg-background px-5 py-8 text-center sm:px-8 sm:py-10">
            <div className="flex flex-col items-center gap-4">
              <Image
                src={logoTeru}
                alt=""
                priority
                className="size-[88px]"
              />
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight">
                  {PLATFORM_NAME}
                </h1>
                <p className="mt-1.5 text-muted-foreground">
                  Sistema de gestión para tu negocio
                </p>
              </div>
            </div>

            <CompanyFinder />
          </div>
        </div>
      </main>
    </div>
  );
}
