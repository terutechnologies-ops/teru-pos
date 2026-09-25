"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck, Send, TriangleAlert } from "lucide-react";

import { EmailField } from "@/components/shared/auth-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { requestResetAction, type RecoverFormState } from "./actions";

const initialState: RecoverFormState = {
  status: "idle",
  message: null,
  email: "",
};

export function RecoverForm({ companySlug }: { companySlug: string }) {
  const [state, formAction, pending] = useActionState(
    requestResetAction,
    initialState,
  );
  const backToLogin = (
    <Link
      href={`/${companySlug}/login`}
      className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-link underline-offset-4 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Volver a iniciar sesión
    </Link>
  );

  if (state.status === "sent") {
    return (
      <div className="space-y-6 text-center" aria-live="polite">
        <div className="flex flex-col items-center gap-3 rounded-lg bg-muted p-5">
          <MailCheck className="size-8 text-accent-foreground" aria-hidden />
          <p className="text-sm">
            Si <strong>{state.email}</strong> está registrado, recibirás un
            enlace para restablecer tu contraseña. Vence en 20 minutos.
          </p>
        </div>
        {backToLogin}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company" value={companySlug} />
      {state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[13px] font-semibold">
          Correo electrónico registrado
        </Label>
        <EmailField
          id="email"
          name="email"
          autoComplete="email"
          defaultValue={state.email}
          required
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 text-[15px] font-bold shadow-md hover:shadow-lg"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Enviando…
          </>
        ) : (
          <>
            Enviar enlace
            <Send aria-hidden />
          </>
        )}
      </Button>
      {backToLogin}
    </form>
  );
}
