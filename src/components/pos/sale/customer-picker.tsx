"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";

import { taxIdText } from "@/components/printing/sheet-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/company-formats";

// Espera tras la última tecla antes de buscar.
const SEARCH_DELAY_MS = 300;
const MIN_SEARCH = 2;

type PickerCustomer = { id: string; name: string; taxId: string | null };

type SearchState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "done"; customers: T[] };

// Buscador de clientes por nombre o NIT del POS: al vender a crédito (con su
// disponible) o al recibir un abono (con lo que debe). Cada uso pasa su
// búsqueda (una acción del servidor; null = falló) y qué monto mostrar.
export function CustomerPicker<T extends PickerCustomer>({
  title,
  currency,
  search,
  amount,
  emptyText,
  onSelect,
  onCancel,
}: {
  title: string;
  currency: string;
  search: (term: string) => Promise<T[] | null>;
  // Monto a la derecha de cada cliente; disabled = se ve pero no se elige.
  amount: (customer: T) => { label: string; value: string; disabled?: boolean };
  emptyText: string;
  onSelect: (customer: T) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState<T>>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Solo cuenta la respuesta de la última búsqueda.
  const latest = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function change(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const term = value.trim();
    if (term.length < MIN_SEARCH) {
      latest.current += 1;
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    timer.current = setTimeout(async () => {
      const id = ++latest.current;
      const customers = await search(term).catch(() => null);
      if (id !== latest.current) return;
      setState(customers ? { kind: "done", customers } : { kind: "error" });
    }, SEARCH_DELAY_MS);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Volver">
            <ArrowLeft aria-hidden />
          </Button>
        )}
        <p className="font-bold">{title}</p>
      </div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          autoFocus
          value={query}
          onChange={(event) => change(event.target.value)}
          placeholder="Nombre o NIT del cliente"
          aria-label="Buscar cliente por nombre o NIT"
          className="h-12 bg-card pl-9 text-base"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {state.kind === "idle" && (
          <p className="text-sm text-muted-foreground">
            Escribe al menos {MIN_SEARCH} letras del nombre o del NIT.
          </p>
        )}
        {state.kind === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Buscando…
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-sm text-destructive">No pudimos buscar. Inténtalo de nuevo.</p>
        )}
        {state.kind === "done" && state.customers.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        {state.kind === "done" && state.customers.length > 0 && (
          <ul className="flex flex-col gap-2">
            {state.customers.map((customer) => {
              const shown = amount(customer);
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    disabled={shown.disabled}
                    onClick={() => onSelect(customer)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{customer.name}</span>
                      {customer.taxId && (
                        <span className="block text-xs text-muted-foreground">
                          {taxIdText(customer.taxId)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs text-muted-foreground">{shown.label}</span>
                      <span className="block font-bold tabular-nums">
                        {formatMoney(Number(shown.value), currency)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
