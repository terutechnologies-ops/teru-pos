"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { renameCategoryAction } from "./category-actions";
import type { CategoryFormState } from "./category-fields";

// Va dentro de un <details> de la fila: se despliega sin JS.
export function RenameCategoryForm({
  companySlug,
  id,
  currentName,
}: {
  companySlug: string;
  id: string;
  currentName: string;
}) {
  const [state, formAction, pending] = useActionState(renameCategoryAction, {
    status: "idle",
    error: null,
    name: currentName,
  } satisfies CategoryFormState);
  const inputId = `rename-${id}`;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-2">
        <Input
          id={inputId}
          name="name"
          defaultValue={state.name}
          required
          maxLength={60}
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
  );
}
