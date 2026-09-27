import Image from "next/image";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZES = {
  // Lista de productos.
  sm: { box: "size-12 rounded-lg", icon: "size-5", px: 48 },
  // Página del producto.
  lg: { box: "size-24 rounded-2xl", icon: "size-8", px: 96 },
} as const;

// Foto del producto o, si no tiene, un ícono.
export function ProductThumb({
  imageUrl,
  productName,
  size,
}: {
  imageUrl: string | null;
  productName: string;
  size: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        s.box,
      )}
    >
      {imageUrl ? (
        // unoptimized: la foto ya viene reducida y se sirve con caché.
        <Image
          src={imageUrl}
          alt={`Foto de ${productName}`}
          width={s.px}
          height={s.px}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <Package className={s.icon} aria-hidden />
      )}
    </span>
  );
}
