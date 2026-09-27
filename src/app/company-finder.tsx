"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, Store, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { findCompanyAction, type FindCompanyState } from "./actions";

const initialState: FindCompanyState = { notFound: false, typed: "" };

export function CompanyFinder() {
  const [state, formAction, pending] = useActionState(
    findCompanyAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="flex w-full flex-col gap-5 rounded-2xl border border-border bg-card p-5 text-left shadow-lg sm:p-6"
    >
      <h2 className="text-center text-lg font-bold">Ingresa a tu empresa</h2>

      {state.notFound && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>
            No encontramos esa empresa. Revisa cómo está escrita o pide el
            enlace al administrador de tu negocio.
          </AlertDescription>
        </Alert>
      )}

      <div className="relative flex items-center">
        {/* El título ya lo dice; la etiqueta queda para lectores de pantalla. */}
        <Label htmlFor="empresa" className="sr-only">
          Nombre de tu empresa
        </Label>
        <Input
          id="empresa"
          name="empresa"
          defaultValue={state.typed}
          placeholder="tu-empresa"
          autoComplete="organization"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={200}
          aria-invalid={state.notFound || undefined}
          className="h-12 rounded-xl border-2 border-input bg-card pr-12 pl-4 text-base shadow-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20"
        />
        <Store
          className="pointer-events-none absolute right-4 size-5 text-muted-foreground"
          aria-hidden
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <ArrowRight aria-hidden />
        )}
        Continuar
      </Button>
    </form>
  );
}
