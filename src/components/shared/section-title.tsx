import type { ReactNode } from "react";

// Encabezado de una tarjeta (asistente, inicio). titleId: para que la
// sección se nombre con su título (aria-labelledby).
export function SectionTitle({
  icon,
  title,
  titleId,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  titleId?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
