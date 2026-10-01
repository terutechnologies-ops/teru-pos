"use client";

import { Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/company-formats";
import { SALE_MAX_QUANTITY, SALE_NOTE_MAX } from "@/server/validations/sales";

import { toCents } from "./money";

export type CartLine = {
  productId: string;
  name: string;
  price: string;
  quantity: number;
  note: string;
};

// Pedido en curso: cantidades, notas, total y paso al cobro.
export function CartPanel({
  lines,
  currency,
  totalCents,
  onQuantity,
  onNote,
  onRemove,
  onClear,
  onCheckout,
}: {
  lines: CartLine[];
  currency: string;
  totalCents: number;
  onQuantity: (productId: string, quantity: number) => void;
  onNote: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <ShoppingBasket className="size-10 text-muted-foreground" aria-hidden />
        <p className="font-bold">Pedido vacío</p>
        <p className="text-sm text-muted-foreground">Toca un producto para agregarlo.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
        {lines.map((line) => (
          <li key={line.productId} className="flex flex-col gap-2 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 font-bold leading-tight">{line.name}</span>
              <span className="shrink-0 font-bold tabular-nums">
                {formatMoney((toCents(line.price) * line.quantity) / 100, currency)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-10"
                onClick={() => onQuantity(line.productId, line.quantity - 1)}
                aria-label={`Quitar uno de ${line.name}`}
              >
                <Minus aria-hidden />
              </Button>
              <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
                {line.quantity}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-10"
                disabled={line.quantity >= SALE_MAX_QUANTITY}
                onClick={() => onQuantity(line.productId, line.quantity + 1)}
                aria-label={`Agregar uno de ${line.name}`}
              >
                <Plus aria-hidden />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                × {formatMoney(Number(line.price), currency)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-10 text-muted-foreground"
                onClick={() => onRemove(line.productId)}
                aria-label={`Quitar ${line.name} del pedido`}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <Input
              value={line.note}
              onChange={(event) => onNote(line.productId, event.target.value)}
              maxLength={SALE_NOTE_MAX}
              placeholder="Nota (opcional): sin sal, para llevar…"
              aria-label={`Nota para ${line.name}`}
              className="h-9 rounded-md bg-muted text-sm"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-muted-foreground">Total</span>
          <span className="text-3xl font-extrabold tabular-nums">
            {formatMoney(totalCents / 100, currency)}
          </span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" variant="ghost" className="h-14" onClick={onClear}>
            Vaciar
          </Button>
          <Button type="button" className="h-14 text-base font-bold" onClick={onCheckout}>
            Cobrar
          </Button>
        </div>
      </div>
    </div>
  );
}
