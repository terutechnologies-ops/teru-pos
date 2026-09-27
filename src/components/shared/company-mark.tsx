import Image from "next/image";
import { Store } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZES = {
  // Pantallas de acceso.
  lg: { box: "size-16 rounded-2xl", icon: "size-8", px: 64 },
  // Menú lateral y encabezado del asistente.
  sm: { box: "size-9 rounded-full", icon: "size-5", px: 36 },
} as const;

// Identidad de la empresa: su logo sobre fondo claro (para que se vea sobre
// el morado oscuro) o, si no tiene, el ícono de tienda en lima.
export function CompanyMark({
  logoUrl,
  companyName,
  size,
  className,
}: {
  logoUrl: string | null;
  companyName: string;
  size: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  if (logoUrl) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-white p-1 shadow-sm",
          s.box,
          className,
        )}
      >
        {/* unoptimized: la imagen ya viene limitada en tamaño y se sirve desde
            el almacenamiento con caché; así no hay que declarar su dominio. */}
        <Image
          src={logoUrl}
          alt={`Logo de ${companyName}`}
          width={s.px}
          height={s.px}
          unoptimized
          className="size-full object-contain"
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "lg"
          ? "bg-brand text-highlight shadow-md"
          : "bg-highlight text-highlight-foreground",
        s.box,
        className,
      )}
    >
      <Store className={s.icon} aria-hidden />
    </span>
  );
}
