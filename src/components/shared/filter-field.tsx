import type { ReactNode } from "react";

// Campo de un formulario de filtros GET (fechas y listas de selección).
export const filterControlClass =
  "h-10 min-w-0 rounded-lg border border-transparent bg-muted px-3 text-sm outline-none focus-visible:bg-card";

export function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
