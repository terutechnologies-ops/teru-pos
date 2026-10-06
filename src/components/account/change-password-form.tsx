"use client";

import { useActionState } from "react";
import { CircleCheck, KeyRound, Loader2, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { changePasswordAction } from "./change-password-actions";
import {
  initialChangePasswordState,
  type ChangePasswordFormState,
} from "./change-password-fields";

const fieldClass = "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

const FIELDS = [
  { name: "currentPassword", label: "Contraseña actual", autoComplete: "current-password" },
  { name: "password", label: "Contraseña nueva", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Repite la contraseña nueva", autoComplete: "new-password" },
] as const;

// Cambiar la propia contraseña. Funciona sin JS; tras un cambio exitoso el
// formulario vuelve a montarse vacío.
export function ChangePasswordForm({ companySlug }: { companySlug: string }) {
  const [state, formAction, pending] = useActionState<ChangePasswordFormState, FormData>(
    changePasswordAction,
    initialChangePasswordState,
  );

  return (
    <div className="flex flex-col gap-4">
      {state.message && (
        <Alert variant={state.status === "error" ? "destructive" : "default"} aria-live="polite">
          {state.status === "error" ? <TriangleAlert /> : <CircleCheck className="text-success" />}
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <form key={state.savedCount} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="company" value={companySlug} />
        {FIELDS.map(({ name, label, autoComplete }) => {
          const error = state.fieldErrors[name];
          return (
            <FormField key={name} name={name} label={label} required error={error}>
              <Input
                id={name}
                name={name}
                type="password"
                required
                minLength={name === "currentPassword" ? undefined : 8}
                maxLength={200}
                autoComplete={autoComplete}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${name}-error` : undefined}
                className={fieldClass}
              />
            </FormField>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Mínimo 8 caracteres. Al cambiarla se cierra tu sesión en los demás equipos; en este
          sigues conectado.
        </p>
        <Button type="submit" disabled={pending} className="h-11 w-fit gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          Cambiar contraseña
        </Button>
      </form>
    </div>
  );
}
