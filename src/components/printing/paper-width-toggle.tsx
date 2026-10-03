"use client";

import { Button } from "@/components/ui/button";

import { PAPER_WIDTHS, type PaperWidth } from "./print-settings";

// Ancho del rollo de la impresora térmica: 80 mm (el más común) o 58 mm.
export function PaperWidthToggle({
  value,
  onChange,
}: {
  value: PaperWidth;
  onChange: (value: PaperWidth) => void;
}) {
  return (
    <div role="group" aria-label="Ancho del papel" className="flex gap-1 rounded-lg bg-muted p-1">
      {PAPER_WIDTHS.map((width) => (
        <Button
          key={width}
          type="button"
          size="sm"
          variant={value === width ? "default" : "ghost"}
          aria-pressed={value === width}
          onClick={() => onChange(width)}
        >
          {width} mm
        </Button>
      ))}
    </div>
  );
}
