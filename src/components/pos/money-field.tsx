"use client";

import { useState } from "react";

import { FormField } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { currencyDecimals, formatAmountInput } from "@/lib/company-formats";
import { cn } from "@/lib/utils";

// lg: grande y táctil (POS); md: del tamaño de los campos del panel; form:
// de los formularios de datos (productos).
const SIZES = {
  lg: { prefix: "left-4 text-sm", input: "h-14 pl-16 text-xl font-bold" },
  md: { prefix: "left-3 text-xs", input: "h-10 border-transparent pl-14 text-sm focus-visible:bg-card" },
  form: { prefix: "left-3 text-xs", input: "h-11 border-transparent pl-14 text-sm focus-visible:bg-card" },
} as const;

// Monto en la moneda de la empresa. Muestra
// los separadores de miles mientras se escribe ("200.000"); el servidor lo
// interpreta con parseAmountInput (también si llega sin separadores).
export function MoneyField({
  name,
  id = name,
  label,
  currency,
  defaultValue = "",
  error,
  hint,
  placeholder,
  size = "lg",
}: {
  name: string;
  // Con varios campos del mismo nombre en la página (uno por línea).
  id?: string;
  label: string;
  currency: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  size?: keyof typeof SIZES;
}) {
  const decimals = currencyDecimals(currency);
  const [value, setValue] = useState(() => formatAmountInput(defaultValue, decimals));
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ");
  return (
    <FormField name={id} label={label} required error={error}>
      <div className="relative flex items-center">
        <span
          className={cn(
            "pointer-events-none absolute font-semibold text-muted-foreground",
            SIZES[size].prefix,
          )}
        >
          {currency}
        </span>
        <Input
          id={id}
          name={name}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          value={value}
          onChange={(event) => setValue(formatAmountInput(event.target.value, decimals))}
          maxLength={20}
          required
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn("rounded-lg bg-muted tabular-nums", SIZES[size].input)}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </FormField>
  );
}
