"use client";

import { useActionState, useState } from "react";
import { CircleCheck, ImageIcon, Loader2, Plus, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { ImagePicker } from "@/components/shared/image-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { MoneyField } from "../money-field";
import { registerCashMovementAction } from "./cash-movement-actions";
import {
  CASH_MOVEMENT_KINDS,
  initialCashMovementState,
  type CashMovementFormState,
  type CashMovementKind,
} from "./cash-movement-fields";

const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-muted px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

// Registra un gasto, retiro o ingreso en el turno propio. Con JS, la
// categoría y la foto solo aparecen en un gasto; sin JS se ven siempre y el
// servidor las ignora en retiros e ingresos.
export function CashMovementForm({
  companySlug,
  currency,
  categories,
}: {
  companySlug: string;
  currency: string;
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    registerCashMovementAction,
    initialCashMovementState,
  );

  return (
    <div className="flex flex-col gap-5">
      {state.message && (
        <Alert variant={state.status === "error" ? "destructive" : "default"} aria-live="polite">
          {state.status === "error" ? <TriangleAlert /> : <CircleCheck className="text-success" />}
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {/* Tras registrar se vuelve a montar vacío (el monto es controlado). */}
      <MovementFields
        key={state.savedCount}
        state={state}
        formAction={formAction}
        pending={pending}
        companySlug={companySlug}
        currency={currency}
        categories={categories}
      />
    </div>
  );
}

function MovementFields({
  state,
  formAction,
  pending,
  companySlug,
  currency,
  categories,
}: {
  state: CashMovementFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  companySlug: string;
  currency: string;
  categories: { id: string; name: string }[];
}) {
  const { values, fieldErrors } = state;
  const [kind, setKind] = useState<CashMovementKind>(
    values.type && values.type in CASH_MOVEMENT_KINDS ? (values.type as CashMovementKind) : "EXPENSE",
  );
  const [preparing, setPreparing] = useState(false);
  const isExpense = kind === "EXPENSE";
  const imageError = fieldErrors.image ??
    (state.imageDropped ? "Vuelve a elegir la foto: el navegador la descarta al corregir el formulario." : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="company" value={companySlug} />

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Tipo</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(CASH_MOVEMENT_KINDS) as CashMovementKind[]).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border-2 border-transparent bg-muted px-3 py-2.5 transition-colors hover:border-input has-[:checked]:border-ring has-[:checked]:bg-accent/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <span className="flex items-center gap-2 font-bold">
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="accent-primary"
                />
                {CASH_MOVEMENT_KINDS[value].label}
              </span>
              <span className="text-xs text-muted-foreground">{CASH_MOVEMENT_KINDS[value].help}</span>
            </label>
          ))}
        </div>
        {fieldErrors.type && <p className="text-xs font-medium text-destructive">{fieldErrors.type}</p>}
      </fieldset>

      <MoneyField
        name="amount"
        label="Monto"
        currency={currency}
        defaultValue={values.amount}
        error={fieldErrors.amount}
      />

      {isExpense && (
        <FormField name="categoryId" label="Categoría" required error={fieldErrors.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={values.categoryId ?? ""}
            required
            aria-invalid={fieldErrors.categoryId ? true : undefined}
            aria-describedby={fieldErrors.categoryId ? "categoryId-error" : undefined}
            className={`h-12 ${controlClass}`}
          >
            <option value="">Elige la categoría…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField name="note" label="Nota (opcional)" error={fieldErrors.note}>
        <textarea
          id="note"
          name="note"
          defaultValue={values.note}
          maxLength={200}
          rows={2}
          placeholder={isExpense ? "Ej: domicilio de la tarde" : "Ej: a la caja fuerte"}
          aria-invalid={fieldErrors.note ? true : undefined}
          aria-describedby={fieldErrors.note ? "note-error" : undefined}
          className={`py-2 placeholder:text-muted-foreground ${controlClass}`}
        />
      </FormField>

      {isExpense && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">Foto del recibo (opcional)</p>
          <ImagePicker
            id="image"
            current={
              <span className="flex size-24 items-center justify-center rounded-2xl border border-dashed border-input bg-muted text-muted-foreground">
                <ImageIcon className="size-6" aria-hidden />
              </span>
            }
            invalid={Boolean(imageError)}
            describedBy={imageError ? "image-error" : undefined}
            onPreparingChange={setPreparing}
          />
          {imageError && (
            <p id="image-error" className="text-xs font-medium text-destructive">
              {imageError}
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={pending || preparing}
        size="lg"
        className="h-14 gap-2 text-base font-bold"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {CASH_MOVEMENT_KINDS[kind].submit}
      </Button>
    </form>
  );
}
