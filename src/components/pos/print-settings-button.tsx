"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

import { PaperWidthToggle } from "@/components/printing/paper-width-toggle";
import {
  DEFAULT_PRINT_SETTINGS,
  PAPER_WIDTH_OPTIONS,
  loadPrintSettings,
  savePrintSettings,
  type PrintSettings,
} from "@/components/printing/print-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Impresora de esta caja: ancho del papel y comanda automática al cobrar.
export function PrintSettingsButton() {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con localStorage, que solo existe tras montar */
    setSettings(loadPrintSettings());
  }, []);

  function update(change: Partial<PrintSettings>) {
    const next = { ...settings, ...change };
    setSettings(next);
    savePrintSettings(next);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-11 gap-2">
          <Printer aria-hidden />
          Impresión
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="dark flex flex-col gap-6 p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Impresión</SheetTitle>
          <SheetDescription>Se guarda solo en este equipo.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Ancho del papel</p>
          <PaperWidthToggle
            value={settings.paperWidth}
            options={PAPER_WIDTH_OPTIONS}
            onChange={(paperWidth) => update({ paperWidth })}
          />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={settings.printTicketOnCheckout}
            onCheckedChange={(checked) => update({ printTicketOnCheckout: checked === true })}
          />
          <span>
            <span className="font-semibold">Imprimir comanda al cobrar</span>
            <span className="block text-muted-foreground">
              Sale sola en la impresora de la caja con cada venta.
            </span>
          </span>
        </label>
      </SheetContent>
    </Sheet>
  );
}
