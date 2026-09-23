"use client";

import { useActionState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { PasswordField } from "@/components/shared/auth-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { resetPasswordAction, type ResetFormState } from "./actions";
import { InvalidLink } from "./invalid-link";

const initialState: ResetFormState = {
  formError: null,
  tokenInvalid: false,
  fieldErrors: {},
};

export function ResetForm({
  companySlug,
  token,
  minLength,
}: {
  companySlug: string;
  token: string;
  minLength: number;
}) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialState,
  );

  if (state.tokenInvalid) return <InvalidLink companySlug={companySlug} />;

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
          Nueva contraseña
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
        className="h-12 w-full gap-2 text-[15px] font-bold shadow-md hover:shadow-lg"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Guardando…
          </>
        ) : (
          <>
            Guardar contraseña
            <Check aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
