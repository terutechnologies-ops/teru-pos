"use client";

import { useState, useTransition } from "react";
import { Banknote, CircleCheck, Loader2, Printer, TriangleAlert } from "lucide-react";

import { printInBackground, printSheetHref } from "@/components/printing/print-sheets";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencyDecimals, formatAmountInput, formatMoney } from "@/lib/company-formats";
import type {
  CustomerPaymentField,
  PaymentCustomer,
  RegisterCustomerPaymentResult,
} from "@/server/services/customer-payments";
import { CUSTOMER_PAYMENT_NOTE_MAX } from "@/server/validations/customer-payments";

import { centsToInput, inputToCents, toCents } from "../sale/money";
import { CustomerPicker } from "../sale/customer-picker";
import { registerCustomerPaymentAction, searchPaymentCustomersAction } from "./customer-payment-actions";

type Method = { id: string; name: string; isCash: boolean };
type Done = Extract<RegisterCustomerPaymentResult, { ok: true }> & { customerName: string };

const inputClass = "h-12 bg-muted text-lg font-bold tabular-nums";

// Abono de un cliente en el turno propio: se elige el cliente (con lo que
// debe), cómo paga y cuánto. En efectivo se puede escribir lo recibido para
// ver el cambio. El servidor vuelve a revisar el saldo y el turno.
export function CustomerPaymentForm({
  companySlug,
  currency,
  methods,
}: {
  companySlug: string;
  currency: string;
  methods: Method[];
}) {
  const decimals = currencyDecimals(currency);
  const money = (value: string) => formatMoney(Number(value), currency);
  const [customer, setCustomer] = useState<PaymentCustomer | null>(null);
  const [methodId, setMethodId] = useState(methods.find((method) => method.isCash)?.id ?? methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CustomerPaymentField, string>>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();

  const method = methods.find((entry) => entry.id === methodId);
  const amountCents = inputToCents(amount);
  const tenderedCents = inputToCents(tendered);
  const changeCents = method?.isCash && tenderedCents > amountCents ? tenderedCents - amountCents : 0;
  const balanceCents = customer ? toCents(customer.balance) : 0;
  const overBalance = amountCents > balanceCents;
  const shortTendered = method?.isCash && tendered !== "" && tenderedCents < amountCents;
  const ready = customer && method && amountCents > 0 && !overBalance && !shortTendered;

  function choose(selected: PaymentCustomer) {
    setCustomer(selected);
    setAmount(centsToInput(toCents(selected.balance), decimals));
    setTendered("");
    setError(null);
    setFieldErrors({});
  }

  function reset() {
    setCustomer(null);
    setAmount("");
    setTendered("");
    setNote("");
    setError(null);
    setFieldErrors({});
    setDone(null);
  }

  function submit() {
    if (!customer) return;
    setError(null);
    setFieldErrors({});
    const payload = {
      customerId: customer.id,
      paymentMethodId: methodId,
      amount,
      tendered: method?.isCash ? tendered : "",
      note,
    };
    startTransition(async () => {
      const result = await registerCustomerPaymentAction(companySlug, payload);
      if (result.ok) {
        setDone({ ...result, customerName: customer.name });
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors);
      }
    });
  }

  if (done) {
    const settled = Number(done.balanceAfter) === 0;
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CircleCheck className="size-12 text-success" aria-hidden />
        <p className="text-2xl font-extrabold">Abono #{done.number}</p>
        <p className="text-sm text-muted-foreground">
          {money(done.amount)} de <span className="font-bold text-foreground">{done.customerName}</span>
        </p>
        <p className="text-sm text-muted-foreground">{settled ? "Queda a paz y salvo" : "Queda debiendo"}</p>
        {!settled && <p className="text-3xl font-extrabold tabular-nums">{money(done.balanceAfter)}</p>}
        {Number(done.change) > 0 && (
          <p className="text-sm">
            Cambio: <span className="text-xl font-extrabold text-primary tabular-nums">{money(done.change)}</span>
          </p>
        )}
        <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 gap-2"
            onClick={() => printInBackground(printSheetHref(companySlug, "abono", done.paymentId, { auto: true }))}
          >
            <Printer aria-hidden />
            Imprimir comprobante
          </Button>
          <Button type="button" className="h-12 font-bold" onClick={reset}>
            Otro abono
          </Button>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <CustomerPicker
        title="¿Quién abona?"
        currency={currency}
        search={(term) => searchPaymentCustomersAction(companySlug, term)}
        amount={(found) => ({ label: "Debe", value: found.balance })}
        emptyText="Ningún cliente con deuda coincide con la búsqueda."
        onSelect={choose}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
        <span className="min-w-0">
          <span className="block truncate font-bold">{customer.name}</span>
          <span className="block text-sm text-muted-foreground tabular-nums">
            Debe {money(customer.balance)}
          </span>
        </span>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={reset}>
          Cambiar
        </Button>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Cómo paga</legend>
        <div className="flex flex-wrap gap-2">
          {methods.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant={entry.id === methodId ? "default" : "secondary"}
              aria-pressed={entry.id === methodId}
              className="h-11 gap-2 px-4 font-bold"
              disabled={pending}
              onClick={() => setMethodId(entry.id)}
            >
              {entry.isCash && <Banknote aria-hidden />}
              {entry.name}
            </Button>
          ))}
        </div>
        {fieldErrors.paymentMethodId && (
          <p className="text-xs font-medium text-destructive">{fieldErrors.paymentMethodId}</p>
        )}
      </fieldset>

      <FormField name="payment-amount" label="Valor del abono" required error={fieldErrors.amount}>
        <Input
          id="payment-amount"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          value={amount}
          onChange={(event) => setAmount(formatAmountInput(event.target.value, decimals))}
          disabled={pending}
          aria-invalid={overBalance || fieldErrors.amount ? true : undefined}
          className={inputClass}
        />
        {overBalance && (
          <p className="text-xs font-medium text-destructive">
            No puede ser mayor que lo que debe ({money(customer.balance)}).
          </p>
        )}
      </FormField>

      {method?.isCash && (
        <FormField name="payment-tendered" label="Recibido (opcional, para calcular el cambio)" error={fieldErrors.tendered}>
          <Input
            id="payment-tendered"
            inputMode={decimals > 0 ? "decimal" : "numeric"}
            value={tendered}
            onChange={(event) => setTendered(formatAmountInput(event.target.value, decimals))}
            disabled={pending}
            aria-invalid={shortTendered || fieldErrors.tendered ? true : undefined}
            className={inputClass}
          />
          {shortTendered && (
            <p className="text-xs font-medium text-destructive">Lo recibido no alcanza a cubrir el abono.</p>
          )}
          {changeCents > 0 && (
            <p className="text-sm">
              Cambio:{" "}
              <span className="font-extrabold text-primary tabular-nums">
                {formatMoney(changeCents / 100, currency)}
              </span>
            </p>
          )}
        </FormField>
      )}

      <FormField name="payment-note" label="Nota (opcional)" error={fieldErrors.note}>
        <Input
          id="payment-note"
          value={note}
          maxLength={CUSTOMER_PAYMENT_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          disabled={pending}
          placeholder="Ej.: abono de la quincena"
          className="h-11 bg-muted"
        />
      </FormField>

      {error && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        className="h-14 gap-2 text-base font-bold"
        disabled={!ready || pending}
        onClick={submit}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Registrar abono {amountCents > 0 && formatMoney(amountCents / 100, currency)}
      </Button>
    </div>
  );
}
