"use client";

import { useState } from "react";

import { FormField } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { currencyDecimals, formatAmountInput } from "@/lib/company-formats";

// Monto en la moneda de la empresa, grande para pantallas táctiles. Muestra
// los separadores de miles mientras se escribe ("200.000"); el servidor lo
// interpreta con parseAmountInput (también si llega sin separadores).
export function MoneyField({
  name,
  label,
  currency,
  defaultValue = "",
  error,
  hint,
}: {
  name: string;
  label: string;
  currency: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
}) {
  const decimals = currencyDecimals(currency);
  const [value, setValue] = useState(() => formatAmountInput(defaultValue, decimals));
  const describedBy = [error && `${name}-error`, hint && `${name}-hint`].filter(Boolean).join(" ");
  return (
    <FormField name={name} label={label} required error={error}>
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-4 text-sm font-semibold text-muted-foreground">
          {currency}
        </span>
        <Input
          id={name}
          name={name}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          value={value}
          onChange={(event) => setValue(formatAmountInput(event.target.value, decimals))}
          maxLength={20}
          required
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="h-14 rounded-lg bg-muted pl-16 text-xl font-bold tabular-nums"
        />
      </div>
      {hint && (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </FormField>
  );
}
