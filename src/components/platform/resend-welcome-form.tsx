"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

import { resendWelcomeAction } from "./company-actions";
import type { ResendWelcomeState } from "./company-fields";

const initialState: ResendWelcomeState = { error: null };

// Genera un enlace nuevo (el anterior deja de servir) y reenvía la
// bienvenida al propietario.
export function ResendWelcomeForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(resendWelcomeAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="company" value={companyId} />
      <Button type="submit" variant="outline" disabled={pending} className="w-fit gap-2">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Reenviar bienvenida
      </Button>
      {state.error && (
        <p className="text-sm font-medium text-destructive" aria-live="polite">
          {state.error}
        </p>
      )}
    </form>
  );
}
