"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save, TriangleAlert, Truck } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupplierField } from "@/server/services/third-parties";

import type { SaveSupplierAction, SupplierFormState, SupplierFormValues } from "./supplier-fields";

const fieldClass = "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

const OPTIONAL_FIELDS: {
  name: Exclude<SupplierField, "name">;
  label: string;
  type: string;
  maxLength: number;
  autoComplete: string;
  placeholder: string;
}[] = [
  {
    name: "taxId",
    label: "NIT",
    type: "text",
    maxLength: 30,
    autoComplete: "off",
    placeholder: "Opcional. Ej: 900.123.456-7",
  },
  {
    name: "phone",
    label: "Teléfono",
    type: "tel",
    maxLength: 30,
    autoComplete: "off",
    placeholder: "Opcional",
  },
  {
    name: "email",
    label: "Correo",
    type: "email",
    maxLength: 254,
    autoComplete: "off",
    placeholder: "Opcional",
  },
];

// Crear y editar proveedores. Sin JS también funciona (useActionState).
export function SupplierForm({
  action,
  companySlug,
  supplierId,
  initialValues,
  submitLabel,
}: {
  action: SaveSupplierAction;
  companySlug: string;
  supplierId?: string;
  initialValues: SupplierFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    message: null,
    fieldErrors: {},
    values: initialValues,
  } satisfies SupplierFormState);
  const { values, fieldErrors } = state;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="company" value={companySlug} />
      {supplierId && <input type="hidden" name="id" value={supplierId} />}

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Truck className="size-5" aria-hidden />}
          title="Datos del proveedor"
          description="El nombre y el NIT no se pueden repetir entre tus proveedores y clientes."
        />

        <FormField name="name" label="Nombre" required error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Ej: Distribuidora El Maizal"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={fieldClass}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-3">
          {OPTIONAL_FIELDS.map((input) => (
            <FormField
              key={input.name}
              name={input.name}
              label={input.label}
              error={fieldErrors[input.name]}
            >
              <Input
                id={input.name}
                name={input.name}
                type={input.type}
                defaultValue={values[input.name]}
                maxLength={input.maxLength}
                autoComplete={input.autoComplete}
                placeholder={input.placeholder}
                aria-invalid={fieldErrors[input.name] ? true : undefined}
                aria-describedby={fieldErrors[input.name] ? `${input.name}-error` : undefined}
                className={fieldClass}
              />
            </FormField>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 -mb-6 flex items-center justify-end gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href={`/${companySlug}/compras/proveedores`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-11 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
