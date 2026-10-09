"use client";

import { useActionState } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlatformCompanyDetail } from "@/server/services/platform/companies";

import { setCompanyActiveAction } from "./company-actions";
import type { CompanyStateFormState } from "./company-fields";

const initialState: CompanyStateFormState = { error: null, reason: "" };

// Acceso de la empresa: desactivar (sin JS, con <details> y motivo; el
// segundo botón confirma) o, si está desactivada, el motivo y reactivar.
export function CompanyAccess({
  company,
}: {
  company: Pick<PlatformCompanyDetail, "id" | "name" | "slug" | "deactivation">;
}) {
  const [state, formAction, pending] = useActionState(setCompanyActiveAction, initialState);
  const deactivation = company.deactivation;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-2 font-bold">Acceso de la empresa</h2>
      {state.error && (
        <p role="alert" className="mb-3 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      {deactivation ? (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="company" value={company.id} />
          <input type="hidden" name="intent" value="reactivate" />
          <p className="text-sm text-muted-foreground">
            Desactivada el {deactivation.at}
            {deactivation.by && ` por ${deactivation.by}`}. Nadie de la empresa puede entrar.
          </p>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="font-semibold">Motivo:</span> {deactivation.reason}
          </p>
          <Button type="submit" disabled={pending} className="w-fit gap-2">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Power aria-hidden />}
            Reactivar empresa
          </Button>
        </form>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Activa: su personal entra por /{company.slug}/login.
          </p>
          <details className="group" open={state.error ? true : undefined}>
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20 [&::-webkit-details-marker]:hidden">
              <PowerOff className="size-4" aria-hidden />
              Desactivar empresa
            </summary>
            <form
              action={formAction}
              className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:p-5"
            >
              <input type="hidden" name="company" value={company.id} />
              <p className="text-sm text-muted-foreground">
                Nadie de {company.name} podrá entrar y se cerrarán todas sus sesiones abiertas
                (también los turnos de caja dejan de poder usarse hasta reactivarla). Sus datos se
                conservan y se puede reactivar cuando quieras.
              </p>
              <FormField name="deactivation-reason" label="Motivo" required>
                <Input
                  id="deactivation-reason"
                  name="reason"
                  defaultValue={state.reason}
                  required
                  minLength={3}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Ej: Suscripción vencida, el cliente pidió suspender el servicio"
                />
              </FormField>
              <Button type="submit" variant="destructive" disabled={pending} className="w-fit gap-2">
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PowerOff aria-hidden />}
                Desactivar {company.name}
              </Button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
