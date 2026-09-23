"use client";

import { useActionState, useState } from "react";
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = { error: null, email: "" };

const fieldClass =
  "h-12 rounded-lg border-transparent bg-muted pl-11 text-sm focus-visible:bg-card";

export function LoginForm({ companySlug }: { companySlug: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative flex items-center">
          <AtSign
            className="pointer-events-none absolute left-4 size-5 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="ejemplo@correo.com"
            defaultValue={state.email}
            required
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[13px] font-semibold">
          Contraseña
        </Label>
        <div className="relative flex items-center">
          <Lock
            className="pointer-events-none absolute left-4 size-5 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className={`${fieldClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            className="absolute right-3 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-5" />
            ) : (
              <Eye className="size-5" />
            )}
          </button>
        </div>
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
