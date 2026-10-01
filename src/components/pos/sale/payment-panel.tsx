"use client";

import { ArrowLeft, Banknote, Loader2, TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencyDecimals, formatAmountInput, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { PosCatalog } from "@/server/services/sales";

import { centsToInput, paymentTotals, type PaymentDraft } from "./money";

type Method = PosCatalog["paymentMethods"][number];

// Cobro con pago mixto, un pago por método. En efectivo se escribe lo que
// entrega el cliente: se aplica hasta lo que falta y lo demás es cambio; si
// no alcanza, el resto se cobra con otro método.
export function PaymentPanel({
  methods,
  currency,
  totalCents,
  payments,
  error,
  pending,
  onChange,
  onBack,
  onConfirm,
}: {
  methods: Method[];
  currency: string;
  totalCents: number;
  payments: PaymentDraft[];
  error: string | null;
  pending: boolean;
  onChange: (payments: PaymentDraft[]) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const decimals = currencyDecimals(currency);
  const money = (cents: number) => formatMoney(cents / 100, currency);
  const totals = paymentTotals(payments, methods, totalCents);
  const { remaining, change, cashDue, cashApplied } = totals;
  const used = new Set(payments.map((payment) => payment.paymentMethodId));
  const ready = payments.length > 0 && remaining === 0 && !totals.invalid;

  // Un método nuevo propone lo que falta (en efectivo: lo que falta, como
  // si pagara exacto; se corrige con lo que entregue).
  const addMethod = (method: Method) =>
    onChange([
      ...payments,
      { paymentMethodId: method.id, amount: centsToInput(Math.max(remaining, 0), decimals) },
    ]);
  const update = (index: number, amount: string) =>
    onChange(payments.map((payment, i) => (i === index ? { ...payment, amount } : payment)));
  const remove = (index: number) => onChange(payments.filter((_, i) => i !== index));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Volver al pedido">
          <ArrowLeft aria-hidden />
        </Button>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Total a cobrar</p>
          <p className="text-3xl font-extrabold tabular-nums">{money(totalCents)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {methods
          .filter((method) => !used.has(method.id))
          .map((method) => (
            <Button
              key={method.id}
              type="button"
              variant="secondary"
              className="h-12 gap-2 px-4 font-bold"
              disabled={pending || remaining <= 0}
              onClick={() => addMethod(method)}
            >
              {method.isCash && <Banknote aria-hidden />}
              {method.name}
            </Button>
          ))}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {payments.map((payment, index) => {
          const method = methods.find((m) => m.id === payment.paymentMethodId);
          const inputId = `pay-${payment.paymentMethodId}`;
          const isCash = method?.isCash ?? false;
          return (
            <li key={payment.paymentMethodId} className="flex flex-col gap-2 rounded-xl bg-muted p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{method?.name ?? "Método"}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={pending}
                  onClick={() => remove(index)}
                  aria-label={`Quitar ${method?.name ?? "pago"}`}
                >
                  <X aria-hidden />
                </Button>
              </div>
              {isCash && (
                <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground">
                  Recibido (lo que entrega el cliente)
                </label>
              )}
              <div className="flex gap-2">
                <Input
                  id={inputId}
                  inputMode={decimals > 0 ? "decimal" : "numeric"}
                  value={payment.amount}
                  onChange={(event) => update(index, formatAmountInput(event.target.value, decimals))}
                  aria-label={isCash ? undefined : `Monto en ${method?.name ?? "este método"}`}
                  disabled={pending}
                  className="h-12 min-w-0 flex-1 bg-card text-lg font-bold tabular-nums"
                />
                {isCash && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    disabled={pending}
                    onClick={() => update(index, centsToInput(cashDue, decimals))}
                  >
                    Exacto
                  </Button>
                )}
              </div>
              {isCash && cashApplied > 0 && cashApplied < cashDue && (
                <p className="text-xs text-muted-foreground">
                  Se aplican {money(cashApplied)} en efectivo. Cobra el resto con otro método.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {error && (
          <Alert variant="destructive" aria-live="polite">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{remaining < 0 ? "Pagos de más" : "Falta"}</dt>
            <dd className={cn("font-bold tabular-nums", remaining !== 0 && "text-destructive")}>
              {money(Math.abs(remaining))}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Cambio</dt>
            <dd className="text-xl font-extrabold text-primary tabular-nums">{money(change)}</dd>
          </div>
        </dl>
        {totals.invalid && payments.length > 0 && (
          <p className="text-xs font-medium text-destructive">
            Hay un método sin monto o que ya no hace falta. Escribe su valor o quítalo.
          </p>
        )}
        <Button
          type="button"
          className="h-14 gap-2 text-base font-bold"
          disabled={!ready || pending}
          onClick={onConfirm}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Cobrar {money(totalCents)}
        </Button>
      </div>
    </div>
  );
}
