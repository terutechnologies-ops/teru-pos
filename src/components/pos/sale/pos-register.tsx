"use client";

import { useEffect, useState, useTransition } from "react";
import { ChefHat, CircleCheck, Printer, ShoppingBasket } from "lucide-react";

import { loadPrintSettings } from "@/components/printing/print-settings";
import {
  printInBackground,
  printSheetHref,
  type PrintSheet,
} from "@/components/printing/print-sheets";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { currencyDecimals, formatMoney } from "@/lib/company-formats";
import type { PosCatalog, PosProduct } from "@/server/services/sales";
import { SALE_MAX_QUANTITY } from "@/server/validations/sales";

import { CartPanel, type CartLine } from "./cart-panel";
import { clearCart, loadCart, newClientKey, saveCart } from "./cart-storage";
import { centsToInput, paymentsPayload, toCents, type PaymentDraft } from "./money";
import { PaymentPanel } from "./payment-panel";
import { ProductGrid } from "./product-grid";
import { checkoutAction } from "./sale-actions";

type Step =
  | "cart"
  | "pay"
  | { saleId: string; number: number; total: string; change: string; alreadyRecorded: boolean };

// Pantalla de venta. El pedido vive en el navegador hasta cobrar (por eso
// necesita JavaScript) y se guarda ahí para sobrevivir a una recarga
// (storageKey: uno por empresa, persona y turno). Cada pedido lleva una
// clave: si el cobro se reintenta, el servidor no registra otra venta.
export function PosRegister({
  companySlug,
  catalog,
  storageKey,
}: {
  companySlug: string;
  catalog: PosCatalog;
  storageKey: string;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [clientKey, setClientKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>("cart");
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const { currency } = catalog;
  const decimals = currencyDecimals(currency);
  const totalCents = lines.reduce((sum, line) => sum + toCents(line.price) * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  // Recupera el pedido guardado (también cuando el catálogo cambia, para
  // quitar lo que ya no se puede vender). Solo en el navegador: el servidor
  // no conoce el almacenamiento local.
  useEffect(() => {
    const saved = loadCart(storageKey, catalog);
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza con localStorage, que solo existe tras montar */
    if (saved) {
      setLines(saved.lines);
      setPayments(saved.payments);
      setClientKey(saved.clientKey);
    } else {
      setClientKey((current) => current || newClientKey());
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey, catalog]);

  useEffect(() => {
    if (loaded) saveCart(storageKey, { clientKey, lines, payments });
  }, [loaded, storageKey, clientKey, lines, payments]);

  function add(product: PosProduct) {
    if (typeof step !== "string") newSale();
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (!existing) {
        return [
          ...current,
          { productId: product.id, name: product.name, price: product.price, quantity: 1, note: "" },
        ];
      }
      return current.map((line) =>
        line.productId === product.id
          ? { ...line, quantity: Math.min(line.quantity + 1, SALE_MAX_QUANTITY) }
          : line,
      );
    });
    if (step === "pay") setStep("cart");
  }

  function setQuantity(productId: string, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.productId !== productId)
        : current.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
    );
  }

  function newSale() {
    setLines([]);
    setPayments([]);
    setClientKey(newClientKey());
    setError(null);
    setStep("cart");
  }

  const print = (sheet: PrintSheet, saleId: string) =>
    printInBackground(printSheetHref(companySlug, sheet, saleId, { auto: true }));

  function confirm() {
    setError(null);
    const payload = {
      clientKey,
      lines: lines.map(({ productId, quantity, note }) => ({ productId, quantity, note })),
      payments: paymentsPayload(payments, catalog.paymentMethods, totalCents, decimals),
    };
    startTransition(async () => {
      const result = await checkoutAction(companySlug, payload);
      if (result.ok) {
        // Ya, no en el efecto: el catálogo recargado tras vender no debe
        // restaurar el pedido cobrado.
        clearCart(storageKey);
        setLines([]);
        setPayments([]);
        setClientKey(newClientKey());
        // También si ya estaba registrada: la respuesta del primer cobro se
        // perdió, así que su comanda no salió.
        if (loadPrintSettings().printTicketOnCheckout) print("comanda", result.saleId);
        setStep({
          saleId: result.saleId,
          number: result.number,
          total: result.total,
          change: result.change,
          alreadyRecorded: result.alreadyRecorded,
        });
      } else {
        setError(result.error);
      }
    });
  }

  const panel =
    typeof step !== "string" ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <CircleCheck className="size-12 text-success" aria-hidden />
        <p className="text-2xl font-extrabold">Venta #{step.number}</p>
        {step.alreadyRecorded && (
          <p className="max-w-xs text-sm text-muted-foreground">
            Esta venta ya estaba registrada por {formatMoney(Number(step.total), currency)} (el
            cobro se había enviado antes). No se cobró de nuevo; revisa que no falte nada.
          </p>
        )}
        <p className="text-sm text-muted-foreground">Cambio</p>
        <p className="text-4xl font-extrabold text-primary tabular-nums">
          {formatMoney(Number(step.change), currency)}
        </p>
        <Button type="button" className="mt-4 h-14 w-full text-base font-bold" onClick={newSale}>
          Nueva venta
        </Button>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 gap-2"
            onClick={() => print("soporte", step.saleId)}
          >
            <Printer aria-hidden />
            Soporte
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 gap-2"
            onClick={() => print("comanda", step.saleId)}
          >
            <ChefHat aria-hidden />
            Comanda
          </Button>
        </div>
      </div>
    ) : step === "pay" ? (
      <PaymentPanel
        methods={catalog.paymentMethods}
        currency={currency}
        totalCents={totalCents}
        payments={payments}
        error={error}
        pending={pending}
        onChange={setPayments}
        onBack={() => {
          setError(null);
          setStep("cart");
        }}
        onConfirm={confirm}
      />
    ) : (
      <CartPanel
        lines={lines}
        currency={currency}
        totalCents={totalCents}
        onQuantity={setQuantity}
        onNote={(productId, note) =>
          setLines((current) =>
            current.map((line) => (line.productId === productId ? { ...line, note } : line)),
          )
        }
        onRemove={(productId) => setQuantity(productId, 0)}
        onClear={newSale}
        onCheckout={() => {
          // Con un solo método activo se propone cobrar todo con él.
          if (payments.length === 0 && catalog.paymentMethods.length === 1) {
            const [only] = catalog.paymentMethods;
            setPayments([
              { paymentMethodId: only.id, amount: centsToInput(totalCents, decimals) },
            ]);
          }
          setStep("pay");
        }}
      />
    );

  return (
    <div className="grid min-w-0 gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-0">
      <ProductGrid catalog={catalog} onAdd={add} />

      <aside className="sticky top-20 hidden max-h-[calc(100svh-6rem)] flex-col rounded-2xl bg-card p-4 shadow-sm lg:flex">
        <h2 className="mb-2 text-lg font-extrabold">Pedido</h2>
        {panel}
      </aside>

      {/* En pantallas pequeñas el pedido va en una barra inferior. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button
          type="button"
          className="h-14 w-full justify-between px-5 text-base font-bold"
          onClick={() => setMobileOpen(true)}
        >
          <span className="flex items-center gap-2">
            <ShoppingBasket aria-hidden />
            {itemCount === 1 ? "1 producto" : `${itemCount} productos`}
          </span>
          <span className="tabular-nums">{formatMoney(totalCents / 100, currency)}</span>
        </Button>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="dark flex h-[90svh] flex-col p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Pedido</SheetTitle>
            <SheetDescription className="sr-only">Productos, cobro y resultado de la venta</SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    </div>
  );
}
