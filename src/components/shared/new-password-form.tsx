"use client";

import { useActionState, type ReactNode } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { PasswordField } from "@/components/shared/auth-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Formulario de contraseña nueva con el token de un enlace (restablecer
// contraseña y aceptar invitación).

export type NewPasswordFormState = {
  formError: string | null;
  tokenInvalid: boolean;
  fieldErrors: { password?: string; confirmPassword?: string };
};

const initialState: NewPasswordFormState = {
  formError: null,
  tokenInvalid: false,
  fieldErrors: {},
};

export function NewPasswordForm({
  action,
  companySlug,
  token,
  minLength,
  passwordLabel,
  submitLabel,
  pendingLabel,
  invalidLink,
}: {
  action: (
    prev: NewPasswordFormState,
    formData: FormData,
  ) => Promise<NewPasswordFormState>;
  companySlug: string;
  token: string;
  minLength: number;
  passwordLabel: string;
  submitLabel: string;
  pendingLabel: string;
  // Se muestra si al enviar el enlace resulta inválido.
  invalidLink: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.tokenInvalid) return invalidLink;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company" value={companySlug} />
      <input type="hidden" name="token" value={token} />
      {state.formError && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[13px] font-semibold">
          {passwordLabel}
        </Label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          aria-invalid={!!state.fieldErrors.password}
          aria-describedby="password-help"
        />
        <p
          id="password-help"
          className={`text-xs ${state.fieldErrors.password ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.fieldErrors.password ?? `Mínimo ${minLength} caracteres.`}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword" className="text-[13px] font-semibold">
          Confirmar contraseña
        </Label>
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={!!state.fieldErrors.confirmPassword}
          aria-describedby="confirm-error"
        />
        {state.fieldErrors.confirmPassword && (
          <p id="confirm-error" className="text-xs text-destructive">
            {state.fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {pendingLabel}
          </>
        ) : (
          <>
            {submitLabel}
            <Check aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
