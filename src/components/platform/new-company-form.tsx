"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCompanySlug } from "@/server/validations/auth";

import { createCompanyAction } from "./company-actions";
import { initialNewCompanyState, type NewCompanyFormState } from "./company-fields";

function SlugField({ state, name }: { state: NewCompanyFormState; name: string }) {
  // Mientras no se edite a mano, la dirección sigue al nombre.
  const [edited, setEdited] = useState(state.values.slug !== "");
  const [slug, setSlug] = useState(state.values.slug);
  const value = edited ? slug : toCompanySlug(name);
  return (
    <FormField name="slug" label="Dirección" required error={state.fieldErrors.slug}>
      <div className="flex min-w-0 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <span className="pl-3 text-sm text-muted-foreground">/</span>
        <Input
          id="slug"
          name="slug"
          value={value}
          onChange={(event) => {
            setEdited(true);
            setSlug(event.target.value);
          }}
          required
          maxLength={64}
          autoComplete="off"
          aria-describedby={state.fieldErrors.slug ? "slug-error" : "slug-help"}
          className="border-0 pl-1 shadow-none focus-visible:ring-0"
        />
      </div>
      <p id="slug-help" className="text-xs text-muted-foreground">
        La empresa entra por /{value || "direccion"}/login. No se cambia después: va en los
        enlaces que se envían por correo.
      </p>
    </FormField>
  );
}

export function NewCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompanyAction, initialNewCompanyState);
  const [name, setName] = useState(state.values.name);

  // Los campos con key vuelven a montarse con lo enviado cuando hay errores
  // (el formulario se limpia al terminar la acción).
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField name="name" label="Nombre de la empresa" required error={state.fieldErrors.name}>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            aria-describedby={state.fieldErrors.name ? "name-error" : undefined}
          />
        </FormField>
        <SlugField key={JSON.stringify(state.values)} state={state} name={name} />
        <FormField name="ownerName" label="Nombre del propietario" required error={state.fieldErrors.ownerName}>
          <Input
            id="ownerName"
            name="ownerName"
            defaultValue={state.values.ownerName}
            key={`owner-${state.values.ownerName}`}
            required
            maxLength={120}
            aria-describedby={state.fieldErrors.ownerName ? "ownerName-error" : undefined}
          />
        </FormField>
        <FormField name="ownerEmail" label="Correo del propietario" required error={state.fieldErrors.ownerEmail}>
          <Input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            defaultValue={state.values.ownerEmail}
            key={`email-${state.values.ownerEmail}`}
            required
            autoComplete="off"
            aria-describedby={state.fieldErrors.ownerEmail ? "ownerEmail-error" : undefined}
          />
        </FormField>
      </div>
      <p className="text-sm text-muted-foreground">
        Se crean la empresa, su sede principal con su bodega, los métodos de pago y las
        categorías de gasto por defecto. El propietario recibe por correo la bienvenida con el
        enlace para crear su contraseña (vence en 72 horas).
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" asChild>
          <Link href="/teru">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="gap-2 font-bold">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Crear empresa
        </Button>
      </div>
    </form>
  );
}
