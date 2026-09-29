import type { ReactNode } from "react";
import { PackageOpen, type LucideIcon } from "lucide-react";

// Lista vacía o sin resultados, con una acción opcional.
export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card px-6 py-12 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
