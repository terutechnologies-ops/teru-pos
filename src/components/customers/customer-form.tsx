"use client";

import Link from "next/link";
import { useActionState } from "react";
import { HandCoins, Loader2, Save, TriangleAlert, UserRound } from "lucide-react";

import { MoneyField } from "@/components/pos/money-field";
import { FormField } from "@/components/shared/form-field";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerField } from "@/server/services/customers";

import type { CustomerFormState, CustomerFormValues, SaveCustomerAction } from "./customer-fields";

const fieldClass = "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

const CONTACT_FIELDS: {
  name: Extract<CustomerField, "taxId" | "phone" | "email">;
  label: string;
  type: string;
  maxLength: number;
  placeholder: string;
  hint?: string;
}[] = [
  { name: "taxId", label: "NIT o documento", type: "text", maxLength: 30, placeholder: "Opcional" },
  { name: "phone", label: "Teléfono", type: "tel", maxLength: 30, placeholder: "Opcional" },
  {
    name: "email",
    label: "Correo",
    type: "email",
    maxLength: 254,
    placeholder: "cliente@correo.com",
    hint: "Recibe aquí el registro de cada compra a crédito. Sin correo no se le envía.",
  },
];

// Crear y editar clientes de crédito. Sin JS también funciona
// (useActionState); el cupo muestra los miles con JS.
export function CustomerForm({
  action,
  companySlug,
  currency,
  customerId,
  initialValues,
  submitLabel,
}: {
  action: SaveCustomerAction;
  companySlug: string;
  currency: string;
  customerId?: string;
  initialValues: CustomerFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    message: null,
    fieldErrors: {},
    values: initialValues,
  } satisfies CustomerFormState);
  const { values, fieldErrors } = state;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="company" value={companySlug} />
      {customerId && <input type="hidden" name="id" value={customerId} />}

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<UserRound className="size-5" aria-hidden />}
          title="Datos del cliente"
          description="El nombre y el NIT no se pueden repetir entre tus clientes y proveedores."
        />

        <FormField name="name" label="Nombre" required error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Ej: Restaurante La Esquina"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={fieldClass}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-3">
          {CONTACT_FIELDS.map((input) => {
            const describedBy = [fieldErrors[input.name] && `${input.name}-error`, input.hint && `${input.name}-hint`]
              .filter(Boolean)
              .join(" ");
            return (
              <FormField key={input.name} name={input.name} label={input.label} error={fieldErrors[input.name]}>
                <Input
                  id={input.name}
                  name={input.name}
                  type={input.type}
                  defaultValue={values[input.name]}
                  maxLength={input.maxLength}
                  autoComplete="off"
                  placeholder={input.placeholder}
                  aria-invalid={fieldErrors[input.name] ? true : undefined}
                  aria-describedby={describedBy || undefined}
                  className={fieldClass}
                />
                {input.hint && (
                  <p id={`${input.name}-hint`} className="text-xs text-muted-foreground">
                    {input.hint}
                  </p>
                )}
              </FormField>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<HandCoins className="size-5" aria-hidden />}
          title="Crédito"
          description="Cuánto puede deber como máximo y en cuántos días debe pagar cada compra."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <MoneyField
            name="creditLimit"
            label="Cupo"
            currency={currency}
            defaultValue={values.creditLimit}
            error={fieldErrors.creditLimit}
            hint="0 = sin crédito: no se le puede vender a crédito."
            placeholder="0"
            size="form"
          />
          <FormField name="creditDays" label="Plazo (días)" required error={fieldErrors.creditDays}>
            <Input
              id="creditDays"
              name="creditDays"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              step={1}
              defaultValue={values.creditDays}
              required
              aria-invalid={fieldErrors.creditDays ? true : undefined}
              aria-describedby={fieldErrors.creditDays ? "creditDays-error" : "creditDays-hint"}
              className={fieldClass}
            />
            <p id="creditDays-hint" className="text-xs text-muted-foreground">
              Después de este plazo, lo que no haya pagado de una compra queda vencido.
            </p>
          </FormField>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 -mb-6 flex items-center justify-end gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href={`/${companySlug}/clientes`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-11 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
