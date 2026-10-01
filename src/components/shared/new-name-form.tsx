"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";

import type { NameAction, NameFormState } from "@/components/shared/rename-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: NameFormState = { status: "idle", error: null, name: "" };

// Alta por nombre (categorías, métodos de pago). La acción recibe company y
// name.
export function NewNameForm({
  action,
  companySlug,
  inputId,
  placeholder,
  maxLength,
}: {
  action: NameAction;
  companySlug: string;
  inputId: string;
  placeholder: string;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errorId = `${inputId}-error`;

  return (
    // Tras enviar, React reinicia el formulario a su valor por defecto: vacío
    // si se guardó, lo escrito si hubo error.
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="company" value={companySlug} />
      <Label htmlFor={inputId} className="text-[13px] font-semibold">
        Nombre
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          name="name"
          defaultValue={state.name}
          placeholder={placeholder}
          required
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card"
        />
        <Button type="submit" disabled={pending} className="h-11 shrink-0 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Agregar
        </Button>
      </div>
      {state.error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
