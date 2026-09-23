"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { EmailField, PasswordField } from "@/components/shared/auth-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = { error: null, email: "" };

export function LoginForm({ companySlug }: { companySlug: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company" value={companySlug} />
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
        <EmailField
          id="email"
          name="email"
          autoComplete="username"
          defaultValue={state.email}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-[13px] font-semibold">
            Contraseña
          </Label>
          <Link
            href={`/${companySlug}/recuperar`}
            className="text-[13px] font-semibold text-primary hover:text-accent-foreground"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <PasswordField
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-3">
          <Checkbox id="remember" name="remember" />
          <Label htmlFor="remember" className="cursor-pointer font-normal">
            Recordar mi sesión
          </Label>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden />
          Seguro
        </span>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 text-[15px] font-bold shadow-md hover:shadow-lg"
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
