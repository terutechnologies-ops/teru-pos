"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { printInBackground } from "./print-sheets";

// Botón que imprime una hoja sin salir de la pantalla (POS). href con
// { auto: true }: la hoja se imprime sola al cargar.
export function PrintSheetButton({
  href,
  children,
  ...props
}: { href: string; children: ReactNode } & Omit<ComponentProps<typeof Button>, "onClick">) {
  return (
    <Button type="button" {...props} onClick={() => printInBackground(href)}>
      {children}
    </Button>
  );
}
