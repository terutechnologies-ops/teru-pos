import { PLATFORM_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Firma de la plataforma sobre fondos de marca (morado oscuro): deja claro
// que la empresa usa Teru POS sin competir con su nombre.
export function PlatformMark({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-brand-muted-foreground", className)}>
      Con la tecnología de{" "}
      <span className="font-bold tracking-tight text-brand-foreground">
        {PLATFORM_NAME}
      </span>
    </p>
  );
}
