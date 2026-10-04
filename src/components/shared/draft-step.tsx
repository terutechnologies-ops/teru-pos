"use client";

import { useActionState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import type { RowAction, RowActionState } from "@/components/shared/row-action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: RowActionState = { error: null };

type StepLook = {
  summary: string;
  icon: ReactNode;
  explanation: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  align?: "start" | "end";
};

// Acción sobre todo un borrador que se confirma en dos pasos: se despliega
// (sin JS, con <details>) con su explicación y el botón definitivo. Van en
// una fila flex-row-reverse con flex-wrap (la acción principal primero, a
// la derecha): abierto ocupa todo el ancho (open:basis-full) con su
// recuadro debajo y el otro pasa a la línea siguiente. `align` ubica el
// botón.
function StepShell({
  look,
  error,
  children,
}: {
  look: StepLook;
  error: string | null;
  children: ReactNode;
}) {
  const { summary, icon, destructive = false, align = "start" } = look;
  return (
    <details
      className={cn("group open:basis-full", align === "start" && "mr-auto")}
      open={error ? true : undefined}
    >
      <summary
        className={cn(
          "flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap [&::-webkit-details-marker]:hidden",
          align === "end" && "ml-auto",
          destructive
            ? "border border-input text-destructive hover:bg-muted"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {icon}
        {summary}
      </summary>
      {children}
    </details>
  );
}

const BOX =
  "mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5";

function StepBody({
  look,
  error,
  button,
}: {
  look: StepLook;
  error: string | null;
  button: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground">{look.explanation}</div>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 justify-end">{button}</div>
    </>
  );
}

function SubmitButton({
  look,
  pending,
  ...props
}: {
  look: StepLook;
  pending: boolean;
  form?: string;
  name?: string;
  value?: string;
}) {
  return (
    <Button
      type="submit"
      variant={look.destructive ? "destructive" : "default"}
      disabled={pending}
      className="gap-1.5"
      {...props}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {look.submitLabel}
    </Button>
  );
}

// Con su propio formulario: la acción recibe company e id.
export function DraftStep({
  action,
  companySlug,
  id,
  ...look
}: StepLook & { action: RowAction; companySlug: string; id: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <StepShell look={look} error={state.error}>
      <form action={formAction} className={BOX}>
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={id} />
        <StepBody
          look={look}
          error={state.error}
          button={<SubmitButton look={look} pending={pending} />}
        />
      </form>
    </StepShell>
  );
}

// El botón definitivo envía otro formulario de la página (`form`) con
// intent = `intent`: así viaja también lo que ese formulario tiene escrito.
// Su estado (pendiente y error) lo maneja quien tiene ese formulario.
export function ExternalFormStep({
  form,
  intent,
  pending,
  error,
  ...look
}: StepLook & { form: string; intent: string; pending: boolean; error: string | null }) {
  return (
    <StepShell look={look} error={error}>
      <div className={BOX}>
        <StepBody
          look={look}
          error={error}
          button={
            <SubmitButton look={look} pending={pending} form={form} name="intent" value={intent} />
          }
        />
      </div>
    </StepShell>
  );
}
