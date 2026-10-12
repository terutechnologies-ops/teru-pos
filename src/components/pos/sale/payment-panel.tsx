"use client";

import { useState } from "react";
import { ArrowLeft, Banknote, Contact, Loader2, TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencyDecimals, formatAmountInput, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { PosCatalog, PosCustomer } from "@/server/services/sales";

import { CustomerPicker } from "./customer-picker";
import { centsToInput, inputToCents, paymentTotals, toCents, type PaymentDraft } from "./money";
import { searchCustomersAction } from "./sale-actions";

type Method = PosCatalog["paymentMethods"][number];

// Cobro con pago mixto, un pago por método. En efectivo se escribe lo que
// entrega el cliente: se aplica hasta lo que falta y lo demás es cambio; si
// no alcanza, el resto se cobra con otro método. Crédito pide elegir el
// cliente y no deja pasar de su disponible (el servidor lo vuelve a revisar
// con el saldo del momento).
export function PaymentPanel({
  companySlug,
  methods,
  currency,
  totalCents,
  payments,
  customer,
  error,
  pending,
  onChange,
  onCustomer,
  onBack,
  onConfirm,
}: {
  companySlug: string;
  methods: Method[];
  currency: string;
  totalCents: number;
  payments: PaymentDraft[];
  customer: PosCustomer | null;
  error: string | null;
  pending: boolean;
  onChange: (payments: PaymentDraft[]) => void;
  onCustomer: (customer: PosCustomer | null) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const decimals = currencyDecimals(currency);
  const money = (cents: number) => formatMoney(cents / 100, currency);
  const totals = paymentTotals(payments, methods, totalCents);
  const { remaining, change, cashDue, cashApplied } = totals;
  const used = new Set(payments.map((payment) => payment.paymentMethodId));
  const creditMethod = methods.find((method) => method.isCredit);
  const creditPayment = payments.find((payment) => payment.paymentMethodId === creditMethod?.id);
  const availableCents = customer ? toCents(customer.available) : 0;
  const overLimit = creditPayment !== undefined && inputToCents(creditPayment.amount) > availableCents;
  const missingCustomer = creditPayment !== undefined && !customer;
  const ready =
    payments.length > 0 && remaining === 0 && !totals.invalid && !overLimit && !missingCustomer;

  // Un método nuevo propone lo que falta (en efectivo: lo que falta, como
  // si pagara exacto; se corrige con lo que entregue). Crédito, sin pasar
  // del disponible del cliente.
  const propose = (limit = Infinity) =>
    centsToInput(Math.min(Math.max(remaining, 0), limit), decimals);
  const addMethod = (method: Method) => {
    if (method.isCredit && !customer) {
      setPicking(true);
      return;
    }
    const amount = propose(method.isCredit ? availableCents : Infinity);
    onChange([...payments, { paymentMethodId: method.id, amount }]);
  };
  const update = (index: number, amount: string) =>
    onChange(payments.map((payment, i) => (i === index ? { ...payment, amount } : payment)));
  const remove = (index: number) => {
    if (payments[index].paymentMethodId === creditMethod?.id) onCustomer(null);
    onChange(payments.filter((_, i) => i !== index));
  };
  // Elegido el cliente, se agrega Crédito (o se baja al nuevo disponible).
  const selectCustomer = (selected: PosCustomer) => {
    setPicking(false);
    onCustomer(selected);
    if (!creditMethod) return;
    const limit = toCents(selected.available);
    if (!creditPayment) {
      onChange([...payments, { paymentMethodId: creditMethod.id, amount: propose(limit) }]);
    } else if (inputToCents(creditPayment.amount) > limit) {
      onChange(
        payments.map((payment) =>
          payment === creditPayment ? { ...payment, amount: centsToInput(limit, decimals) } : payment,
        ),
      );
    }
  };

  if (picking) {
    return (
      <CustomerPicker
        title="¿A quién se le vende a crédito?"
        currency={currency}
        search={(term) => searchCustomersAction(companySlug, term)}
        amount={(found) => {
          const noCredit = Number(found.available) <= 0;
          return {
            label: noCredit ? "Sin cupo disponible" : "Disponible",
            value: found.available,
            disabled: noCredit,
          };
        }}
        emptyText="No hay clientes con crédito que coincidan. Los clientes y su cupo se crean en el panel."
        onSelect={selectCustomer}
        onCancel={() => setPicking(false)}
      />
    );
  }

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
              {method.isCredit && <Contact aria-hidden />}
              {method.name}
            </Button>
          ))}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {payments.map((payment, index) => {
          const method = methods.find((m) => m.id === payment.paymentMethodId);
          const inputId = `pay-${payment.paymentMethodId}`;
          const isCash = method?.isCash ?? false;
          const isCredit = method?.isCredit ?? false;
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
              {isCredit && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2">
                  {customer ? (
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-bold">{customer.name}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        Disponible {formatMoney(Number(customer.available), currency)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-destructive">Falta elegir el cliente.</span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setPicking(true)}
                  >
                    {customer ? "Cambiar" : "Elegir"}
                  </Button>
                </div>
              )}
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
              {isCredit && overLimit && customer && (
                <p className="text-xs font-medium text-destructive">
                  Supera el disponible de {customer.name}. Cobra el resto con otro método.
                </p>
              )}
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
