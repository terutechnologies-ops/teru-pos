"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PaperWidthToggle } from "./paper-width-toggle";
import { PRINTED_MESSAGE } from "./print-sheets";
import {
  DEFAULT_PRINT_SETTINGS,
  PAPER_WIDTH_OPTIONS,
  loadPrintSettings,
  savePrintSettings,
  type PaperWidth,
} from "./print-settings";

// Carta: para hojas largas en una impresora normal (existencias). No se
// guarda como papel del equipo, que es el rollo de la caja.
type SheetPaper = PaperWidth | "carta";

const LETTER_OPTIONS = [...PAPER_WIDTH_OPTIONS, { value: "carta" as const, label: "Carta" }];

// Espera el logo y la fuente: imprimir antes deja la hoja incompleta.
async function sheetLoaded() {
  const pending = Array.from(document.images)
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
    );
  await Promise.all([document.fonts.ready, ...pending]);
}

// Hoja imprimible: en pantalla, el papel con una barra (Imprimir, ancho,
// Volver); al imprimir, solo el papel. Con auto se imprime al cargar y
// avisa a la pantalla que la abrió en segundo plano (printInBackground).
export function PrintFrame({
  backHref,
  auto,
  allowLetter = false,
  children,
}: {
  backHref: string;
  auto: boolean;
  allowLetter?: boolean;
  children: ReactNode;
}) {
  const [paper, setPaper] = useState<SheetPaper>(DEFAULT_PRINT_SETTINGS.paperWidth);
  const [loaded, setLoaded] = useState(false);

  // El ancho es de este equipo: solo se conoce en el navegador.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza con localStorage, que solo existe tras montar */
    setPaper(loadPrintSettings().paperWidth);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!auto || !loaded) return;
    let cancelled = false;
    void sheetLoaded().then(() => {
      if (cancelled) return;
      window.print();
      window.parent.postMessage(PRINTED_MESSAGE, window.location.origin);
    });
    return () => {
      cancelled = true;
    };
  }, [auto, loaded]);

  function changePaper(next: SheetPaper) {
    setPaper(next);
    if (next !== "carta") savePrintSettings({ ...loadPrintSettings(), paperWidth: next });
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-6 print:block print:p-0">
      <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href={backHref}>
            <ArrowLeft aria-hidden />
            Volver
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <PaperWidthToggle
            value={paper}
            options={allowLetter ? LETTER_OPTIONS : PAPER_WIDTH_OPTIONS}
            onChange={changePaper}
          />
          <Button type="button" className="gap-2" onClick={() => window.print()}>
            <Printer aria-hidden />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Carta con márgenes de página (en el rollo no hay: lo define el
          ancho del papel). */}
      {paper === "carta" && <style>{"@page { size: letter; margin: 15mm; }"}</style>}

      {/* Ancho útil del rollo: 72 mm en papel de 80 y 48 mm en el de 58; en
          carta, la hoja menos los márgenes. El texto se mide en em: en 58 mm
          todo se reduce en proporción. */}
      <div className="bg-white p-[4mm] shadow-md print:p-0 print:shadow-none">
        <div
          data-paper={paper}
          className="group/sheet w-[72mm] text-[11pt] leading-snug text-black [print-color-adjust:exact] data-[paper=58]:w-[48mm] data-[paper=58]:text-[8.5pt] data-[paper=carta]:w-[186mm]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
