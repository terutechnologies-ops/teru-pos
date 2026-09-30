import { DEVELOPER_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Firma sobre fondos de marca (morado oscuro): quién desarrolla la
// plataforma, sin competir con el nombre de la empresa.
export function PlatformMark({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-brand-muted-foreground", className)}>
      Con la tecnología de{" "}
      <span className="font-bold tracking-tight text-brand-foreground">{DEVELOPER_NAME}</span>
    </p>
  );
}
