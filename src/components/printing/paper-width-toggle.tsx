"use client";

import { Button } from "@/components/ui/button";

// Papel de la hoja: rollo térmico de 80 mm (el más común) o 58 mm y, en
// las hojas que lo permiten, carta.
export function PaperWidthToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label="Papel" className="flex gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
