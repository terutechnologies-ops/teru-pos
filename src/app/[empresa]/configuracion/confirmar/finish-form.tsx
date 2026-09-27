"use client";

import { useActionState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { finishSetupAction, type FinishSetupState } from "./actions";

const initialState: FinishSetupState = { error: null };

export function FinishSetupForm({ companySlug }: { companySlug: string }) {
  const [state, formAction, pending] = useActionState(
    finishSetupAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="company" value={companySlug} />
      {state.error && (
        <p role="alert" className="max-w-64 text-right text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 gap-2 px-5">
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <CheckCheck aria-hidden />
        )}
        Finalizar configuración
      </Button>
    </form>
  );
}
