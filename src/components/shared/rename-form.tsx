"use client";

import { useActionState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type NameFormState = {
  status: "idle" | "saved" | "error";
  error: string | null;
  // Lo escrito, para no perderlo si hubo error.
  name: string;
};

export type NameAction = (prev: NameFormState, formData: FormData) => Promise<NameFormState>;

// "Renombrar" desplegable dentro de una fila (sin JS, con <details>). La
// acción recibe company, id y name. Usarlo con key={nombre actual}: tras
// renombrar se vuelve a montar, cerrado y con el nombre nuevo.
export function RenameForm({
  action,
  companySlug,
  id,
  currentName,
  maxLength,
}: {
  action: NameAction;
  companySlug: string;
  id: string;
  currentName: string;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    error: null,
    name: currentName,
  } satisfies NameFormState);
  const inputId = `rename-${id}`;

  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-semibold text-link [&::-webkit-details-marker]:hidden">
        <Pencil className="size-3" aria-hidden />
        Renombrar
      </summary>
      <form action={formAction} className="mt-2 flex max-w-md flex-col gap-1">
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={id} />
        <div className="flex gap-2">
          <Input
            id={inputId}
            name="name"
            defaultValue={state.name}
            required
            maxLength={maxLength}
            autoComplete="off"
            aria-label={`Nuevo nombre para ${currentName}`}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? `${inputId}-error` : undefined}
            className="h-9 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card"
          />
          <Button type="submit" size="lg" disabled={pending} className="shrink-0 gap-1.5">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Guardar
          </Button>
        </div>
        {state.error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-destructive">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
