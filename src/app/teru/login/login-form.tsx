"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";

import { EmailField, PasswordField } from "@/components/shared/auth-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { platformLoginAction, type PlatformLoginFormState } from "./actions";

const initialState: PlatformLoginFormState = { error: null, email: "" };

// Sin "recordar" ni "¿Olvidaste tu contraseña?": la sesión dura 8 h y la
// contraseña se restablece con el script teru:create-admin.
export function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState(platformLoginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[13px] font-semibold">
          Correo electrónico
        </Label>
        <EmailField id="email" name="email" autoComplete="username" defaultValue={state.email} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[13px] font-semibold">
          Contraseña
        </Label>
        <PasswordField id="password" name="password" autoComplete="current-password" required />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Ingresando…
          </>
        ) : (
          <>
            Iniciar sesión
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
