"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";

import { enrollMfaAction, type EnrollFormState } from "@/app/teru/verificar/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { MfaError, RecoveryCodesList, TotpCodeField } from "./mfa-fields";

const initialState: EnrollFormState = { error: null, restart: false, recoveryCodes: null };

// Confirma la activación con el primer código y muestra los códigos de
// respaldo (una sola vez). Al panel solo después de confirmar que se
// guardaron.
export function EnrollForm() {
  const [state, formAction, pending] = useActionState(enrollMfaAction, initialState);
  const [saved, setSaved] = useState(false);

  if (state.recoveryCodes) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            <span className="font-bold">Verificación activada.</span> Guarda estos códigos de respaldo en un
            lugar seguro: sirven para entrar si pierdes el teléfono. Cada uno sirve una vez y{" "}
            <span className="font-semibold">no se vuelven a mostrar</span>.
          </p>
        </div>
        <RecoveryCodesList codes={state.recoveryCodes} />
        <div className="flex items-center gap-2 print:hidden">
          <Checkbox id="saved" checked={saved} onCheckedChange={(value) => setSaved(value === true)} />
          <Label htmlFor="saved" className="text-sm">
            Ya guardé mis códigos de respaldo
          </Label>
        </div>
        {saved ? (
          <Button asChild className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold print:hidden">
            <Link href="/teru">
              Continuar al panel
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button disabled className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold print:hidden">
            Continuar al panel
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && <MfaError message={state.error} restart={state.restart} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code" className="text-[13px] font-semibold">
          Código que muestra la app
        </Label>
        <TotpCodeField />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Activando…
          </>
        ) : (
          <>
            Activar verificación
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
