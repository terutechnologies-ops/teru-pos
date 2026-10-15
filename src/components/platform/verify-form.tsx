"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, CircleCheck, Loader2 } from "lucide-react";

import { verifyMfaAction, type VerifyFormState } from "@/app/teru/verificar/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { MfaError, RecoveryCodeField, TotpCodeField } from "./mfa-fields";

const initialState: VerifyFormState = { error: null, restart: false, done: false, recoveryCodesLeft: null };

// Código de la app o, con recovery, un código de respaldo. Al verificar con
// un código de respaldo avisa cuántos quedan antes de seguir al panel.
export function VerifyForm({ recovery }: { recovery: boolean }) {
  const [state, formAction, pending] = useActionState(verifyMfaAction, initialState);

  if (state.done) {
    const left = state.recoveryCodesLeft;
    return (
      <div className="space-y-5">
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>
            {left === 0
              ? "Usaste tu último código de respaldo. Pide que reinicien tu verificación para tener códigos nuevos."
              : `Código de respaldo aceptado. Te quedan ${left}; cada uno sirve una sola vez.`}
          </AlertDescription>
        </Alert>
        <Button asChild className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold">
          <Link href="/teru">
            Continuar al panel
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && <MfaError message={state.error} restart={state.restart} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={recovery ? "recoveryCode" : "code"} className="text-[13px] font-semibold">
          {recovery ? "Código de respaldo" : "Código de 6 dígitos"}
        </Label>
        {recovery ? <RecoveryCodeField /> : <TotpCodeField />}
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Verificando…
          </>
        ) : (
          <>
            Verificar
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>

      <p className="text-center text-sm">
        <Link
          href={recovery ? "/teru/verificar" : "/teru/verificar?respaldo=1"}
          className="font-semibold text-link hover:underline"
        >
          {recovery ? "Usar el código de la app" : "¿Perdiste el teléfono? Usa un código de respaldo"}
        </Link>
      </p>
    </form>
  );
}
