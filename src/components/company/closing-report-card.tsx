"use client";

import { useActionState, useState } from "react";
import { CircleCheck, Loader2, Mail, Save, UserPlus } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LastClosingReport } from "@/server/services/companies";

import { saveClosingReportAction } from "./closing-report-actions";
import { emailsToText, type ClosingReportFormState } from "./closing-report-fields";

const fieldClass = "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// Campo de correos. "Agregar mi correo" necesita JS; sin JS se escribe a
// mano. Vuelve a montarse con lo guardado (key en el padre).
function EmailsInput({
  initialValue,
  ownEmail,
  error,
}: {
  initialValue: string;
  ownEmail: string;
  error?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const listed = value
    .toLowerCase()
    .split(/[\s,;]+/)
    .includes(ownEmail.toLowerCase());

  return (
    <FormField name="emails" label="Correos que reciben el reporte" error={error}>
      <Input
        id="emails"
        name="emails"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="off"
        placeholder="dueno@minegocio.com, socio@minegocio.com"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "emails-help emails-error" : "emails-help"}
        className={fieldClass}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="emails-help" className="text-xs text-muted-foreground">
          Hasta 5 correos distintos, separados por coma. Déjalo vacío para no enviarlo.
        </p>
        {!listed && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setValue((current) => (current.trim() ? `${current.trim()}, ${ownEmail}` : ownEmail))}
          >
            <UserPlus aria-hidden />
            Agregar mi correo
          </Button>
        )}
      </div>
    </FormField>
  );
}

function emailsCount(count: number) {
  return count === 1 ? "1 correo" : `${count} correos`;
}

// Estado del último reporte: para saber si llega sin revisar el correo.
function LastReport({ report }: { report: LastClosingReport | null }) {
  if (!report) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no se ha enviado ningún reporte: sale al cerrar el último turno abierto.
      </p>
    );
  }
  const text = {
    SENT: `enviado a ${emailsCount(report.sentCount)}.`,
    PENDING: "enviándose…",
    SKIPPED: "no se envió porque no había destinatarios.",
    FAILED: `no se pudo enviar (llegó a ${report.sentCount} de ${report.recipientCount}).${
      report.error ? ` Motivo: ${report.error}` : ""
    }`,
  }[report.status];
  return (
    <p
      className={cn(
        "text-sm",
        report.status === "FAILED" ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      Último reporte: {report.at} · {text}
    </p>
  );
}

// Configuración > Negocio: a quién se envía el reporte al cerrar el último
// turno del día (lista de compras y resumen).
export function ClosingReportCard({
  companySlug,
  emails,
  ownEmail,
  lastReport,
}: {
  companySlug: string;
  emails: string[];
  ownEmail: string;
  lastReport: LastClosingReport | null;
}) {
  const [state, formAction, pending] = useActionState<ClosingReportFormState, FormData>(
    saveClosingReportAction,
    { status: "idle", message: null, value: emailsToText(emails) },
  );

  return (
    <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
      <SectionTitle
        icon={<Mail className="size-5" aria-hidden />}
        title="Reporte de cierre del día"
        description="Al cerrar el último turno abierto, se envía por correo la lista de compras y un resumen del día (ventas, gastos y faltante o sobrante de caja)."
      />
      <LastReport report={lastReport} />

      {state.status === "saved" && state.message && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="company" value={companySlug} />
        <EmailsInput
          key={`${state.status}:${state.value}`}
          initialValue={state.value}
          ownEmail={ownEmail}
          error={state.status === "error" ? (state.message ?? undefined) : undefined}
        />
        <Button type="submit" disabled={pending} className="h-11 w-fit gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          Guardar destinatarios
        </Button>
      </form>
    </section>
  );
}
