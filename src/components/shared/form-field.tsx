import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

// Etiqueta, control y error de un campo de formulario. El control debe
// usar id={name} y, con error, aria-describedby={`${name}-error`}.
export function FormField({
  name,
  label,
  required,
  error,
  children,
}: {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={name} className="text-[13px] font-semibold">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p id={`${name}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
