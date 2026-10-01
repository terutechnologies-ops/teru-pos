import { formatAmountInput, parseAmountInput } from "@/lib/company-formats";

// Montos del pedido en centavos (enteros) para sumar sin errores de coma
// flotante en el navegador. El servidor recalcula todo con Decimal.

export function toCents(amount: string) {
  return Math.round(Number(amount) * 100);
}

// Centavos → texto decimal con punto ("16500", "4.50"), lo que recibe el
// servidor.
export function centsToAmount(cents: number, decimals: number) {
  return (cents / 100).toFixed(decimals);
}

// Centavos → lo que se ve en un campo de monto ("16.500", "4,50").
export function centsToInput(cents: number, decimals: number) {
  return formatAmountInput(centsToAmount(cents, decimals).replace(".", ","), decimals);
}

// Lo escrito en un campo de monto → centavos (vacío = 0).
export function inputToCents(text: string) {
  const amount = parseAmountInput(text);
  return amount ? toCents(amount) : 0;
}

export type PaymentDraft = {
  paymentMethodId: string;
  // Como se ve en el campo ("16.500"): en efectivo, lo que entrega el
  // cliente; en los demás métodos, lo que se paga con él.
  amount: string;
};

type MethodKind = { id: string; isCash: boolean };

// Totales del cobro en centavos. El efectivo se aplica solo hasta lo que
// falta después de los demás métodos: si el cliente entrega menos, el resto
// queda pendiente para otro método; si entrega más, es cambio.
export function paymentTotals(payments: PaymentDraft[], methods: MethodKind[], totalCents: number) {
  const isCash = (id: string) => methods.find((method) => method.id === id)?.isCash ?? false;
  let other = 0;
  let received = 0;
  let hasCash = false;
  let emptyPayment = false;
  for (const payment of payments) {
    const cents = inputToCents(payment.amount);
    if (cents <= 0) emptyPayment = true;
    if (isCash(payment.paymentMethodId)) {
      hasCash = true;
      received += cents;
    } else {
      other += cents;
    }
  }
  // Lo que queda para el efectivo después de los demás métodos.
  const cashDue = Math.max(totalCents - other, 0);
  const cashApplied = Math.min(received, cashDue);
  return {
    cashDue,
    cashApplied,
    change: received - cashApplied,
    // Negativo: los demás métodos suman más que el total.
    remaining: totalCents - other - cashApplied,
    // Un efectivo que no alcanza a aplicarse (los demás ya cubren todo)
    // también es inválido: sobraría el método.
    invalid: emptyPayment || (hasCash && cashApplied === 0),
  };
}

// Pagos para el servidor (texto decimal con punto). El efectivo va con lo
// aplicado como monto y lo entregado como "recibido" si hubo cambio.
export function paymentsPayload(
  payments: PaymentDraft[],
  methods: MethodKind[],
  totalCents: number,
  decimals: number,
) {
  const { cashApplied, change } = paymentTotals(payments, methods, totalCents);
  return payments.map((payment) => {
    const cash = methods.find((method) => method.id === payment.paymentMethodId)?.isCash ?? false;
    if (!cash) {
      return {
        paymentMethodId: payment.paymentMethodId,
        amount: centsToAmount(inputToCents(payment.amount), decimals),
        tendered: null,
      };
    }
    return {
      paymentMethodId: payment.paymentMethodId,
      amount: centsToAmount(cashApplied, decimals),
      tendered: change > 0 ? centsToAmount(cashApplied + change, decimals) : null,
    };
  });
}
