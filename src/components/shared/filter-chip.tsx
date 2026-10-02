import Link from "next/link";
import { X } from "lucide-react";

// Filtro activo de una lista (por ejemplo una alerta del inicio), con un
// enlace para quitarlo.
export function FilterChip({ label, clearHref }: { label: string; clearHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Mostrando solo:</span>
      <Link
        href={clearHref}
        aria-label={`Quitar el filtro ${label}`}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-transparent bg-accent px-3 py-1 font-semibold text-accent-foreground transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none"
      >
        {label}
        <X className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
