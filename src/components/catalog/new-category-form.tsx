"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createCategoryAction } from "./category-actions";
import type { CategoryFormState } from "./category-fields";

const initialState: CategoryFormState = { status: "idle", error: null, name: "" };

export function NewCategoryForm({ companySlug }: { companySlug: string }) {
  const [state, formAction, pending] = useActionState(createCategoryAction, initialState);

  return (
    // Tras enviar, React reinicia el formulario a su valor por defecto: vacío
    // si se guardó, lo escrito si hubo error.
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="company" value={companySlug} />
      <Label htmlFor="new-category" className="text-[13px] font-semibold">
        Nombre
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="new-category"
          name="name"
          defaultValue={state.name}
          placeholder="Ej: Arepas, Bebidas, Postres"
          required
          maxLength={60}
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "new-category-error" : undefined}
          className="h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card"
        />
        <Button type="submit" disabled={pending} className="h-11 shrink-0 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Agregar
        </Button>
      </div>
      {state.error && (
        <p id="new-category-error" role="alert" className="text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
