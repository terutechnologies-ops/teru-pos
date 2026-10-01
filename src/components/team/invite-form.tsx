"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import {
  CircleCheck,
  Loader2,
  Mail,
  Send,
  TriangleAlert,
  User,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INVITABLE_ROLE_DESCRIPTIONS,
  STAFF_ROLE_LABELS,
  type InvitableRole,
} from "@/lib/staff-roles";
import { cn } from "@/lib/utils";

import { inviteStaffAction } from "./actions";
import {
  EMPTY_INVITE,
  type InviteFormState,
  type InviteFormValues,
} from "./team-fields";

const fieldClass =
  "h-11 rounded-lg border-transparent bg-muted pl-10 text-sm focus-visible:bg-card";
const iconClass =
  "pointer-events-none absolute left-3.5 size-4 text-muted-foreground";

// `roles`: los que esta persona puede invitar (el servidor lo vuelve a
// verificar).
export function InviteForm({
  companySlug,
  roles,
}: {
  companySlug: string;
  roles: readonly InvitableRole[];
}) {
  const [state, formAction, pending] = useActionState(inviteStaffAction, {
    status: "idle",
    message: null,
    fieldErrors: {},
    values: EMPTY_INVITE,
  } satisfies InviteFormState);
  const { values, fieldErrors } = state;

  return (
    // Tras cada envío React reinicia el formulario a sus valores por defecto,
    // que salen del estado: vacíos al enviar, los escritos si hubo error.
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="company" value={companySlug} />

      {state.message && (
        <Alert
          variant={state.status === "error" ? "destructive" : "default"}
          aria-live="polite"
        >
          {state.status === "error" ? (
            <TriangleAlert />
          ) : (
            <CircleCheck className="text-success" />
          )}
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="name"
          label="Nombre y apellido"
          icon={<User className={iconClass} aria-hidden />}
          defaultValue={values.name}
          error={fieldErrors.name}
          placeholder="Ej: Carlos Méndez"
          autoComplete="off"
          required
        />
        <TextField
          name="email"
          label="Correo electrónico"
          type="email"
          icon={<Mail className={iconClass} aria-hidden />}
          defaultValue={values.email}
          error={fieldErrors.email}
          placeholder="carlos@correo.com"
          autoComplete="off"
          required
        />
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold">Rol</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border-2 border-transparent bg-muted px-3 py-2.5 transition-colors hover:border-input has-[:checked]:border-ring has-[:checked]:bg-accent/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="role"
                value={role}
                defaultChecked={values.role === role}
                className="sr-only"
              />
              <span className="text-sm font-bold">{STAFF_ROLE_LABELS[role]}</span>
              <span className="text-xs text-muted-foreground">
                {INVITABLE_ROLE_DESCRIPTIONS[role]}
              </span>
            </label>
          ))}
        </div>
        <FieldError name="role" error={fieldErrors.role} />
      </fieldset>

      <Button type="submit" disabled={pending} className="h-11 gap-2 self-start px-5">
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Send aria-hidden />
        )}
        Enviar invitación
      </Button>
    </form>
  );
}

function TextField({
  name,
  label,
  icon,
  error,
  ...props
}: {
  name: keyof InviteFormValues;
  label: string;
  icon: ReactNode;
  error?: string;
} & Omit<ComponentProps<typeof Input>, "name" | "className" | "id">) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`invite-${name}`} className="text-[13px] font-semibold">
        {label}
      </Label>
      <div className="relative flex items-center">
        {icon}
        <Input
          id={`invite-${name}`}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className={cn(fieldClass)}
          {...props}
        />
      </div>
      <FieldError name={name} error={error} />
    </div>
  );
}

function FieldError({ name, error }: { name: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${name}-error`} className="text-xs font-medium text-destructive">
      {error}
    </p>
  );
}
