import type { ReactNode } from "react";

// Encabezado de página del panel: antetítulo, título y descripción.
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <span className="text-[11px] font-bold tracking-widest text-accent-foreground uppercase">
        {eyebrow}
      </span>
      <h1 className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
