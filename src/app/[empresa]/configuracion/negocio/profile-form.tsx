"use client";

import {
  useActionState,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  Loader2,
  MapPin,
  Mail,
  Phone,
  ReceiptText,
  Store,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CURRENCY_CODES,
  DATE_FORMATS,
  FEATURED_CURRENCIES,
  currencyName,
  formatDate,
  formatMoney,
  isCurrencyCode,
  isDateFormat,
} from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { CompanyProfileField } from "@/server/services/companies";

import { saveCompanyProfileAction } from "./actions";
import {
  OTHER_CURRENCY,
  type ProfileFormState,
  type ProfileFormValues,
} from "./profile-fields";

// Fecha fija para los ejemplos: día mayor que 12 para que se note el orden
// de día y mes.
const SAMPLE_DATE = new Date(Date.UTC(2026, 2, 24));
const SAMPLE_PRICE = 16500;

const fieldClass =
  "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";
const iconClass =
  "pointer-events-none absolute left-3.5 size-4 text-muted-foreground";

const isFeatured = (code: string) =>
  (FEATURED_CURRENCIES as readonly string[]).includes(code);

export function ProfileForm({
  companySlug,
  initialValues,
}: {
  companySlug: string;
  initialValues: ProfileFormValues;
}) {
  const [state, formAction, pending] = useActionState(saveCompanyProfileAction, {
    status: "idle",
    message: null,
    fieldErrors: {},
    values: initialValues,
  } satisfies ProfileFormState);
  const { values, fieldErrors } = state;

  // Controlados solo para la vista previa; sin JS el formulario funciona
  // igual con los valores enviados.
  const [currencyChoice, setCurrencyChoice] = useState(
    isFeatured(values.currency) ? values.currency : OTHER_CURRENCY,
  );
  const [otherCurrency, setOtherCurrency] = useState(
    isFeatured(values.currency) ? "" : values.currency,
  );
  const [dateFormat, setDateFormat] = useState(values.dateFormat);

  const previewCurrency =
    currencyChoice === OTHER_CURRENCY ? otherCurrency : currencyChoice;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="company" value={companySlug} />

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === "saved" && (
        <Alert aria-live="polite">
          <CircleCheck className="text-success" />
          <AlertDescription>
            Datos guardados. El siguiente paso (Equipo) estará disponible
            pronto.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<BadgeCheck className="size-5" aria-hidden />}
            title="Identidad comercial"
            description="Datos generales para tickets y reportes."
          />
          <TextField
            name="name"
            label="Razón social o nombre comercial"
            required
            icon={<Store className={iconClass} aria-hidden />}
            defaultValue={values.name}
            error={fieldErrors.name}
            autoComplete="organization"
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="taxId"
              label="NIT o identificación fiscal"
              icon={<ReceiptText className={iconClass} aria-hidden />}
              defaultValue={values.taxId}
              error={fieldErrors.taxId}
            />
            <TextField
              name="phone"
              label="Teléfono"
              type="tel"
              icon={<Phone className={iconClass} aria-hidden />}
              defaultValue={values.phone}
              error={fieldErrors.phone}
              autoComplete="tel"
            />
          </div>
          <TextField
            name="email"
            label="Correo administrativo"
            type="email"
            icon={<Mail className={iconClass} aria-hidden />}
            defaultValue={values.email}
            error={fieldErrors.email}
            autoComplete="email"
          />
          <TextField
            name="address"
            label="Dirección de la sede principal"
            icon={<MapPin className={iconClass} aria-hidden />}
            defaultValue={values.address}
            error={fieldErrors.address}
            autoComplete="street-address"
          />
        </section>

        <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<Wallet className="size-5" aria-hidden />}
            title="Moneda y formatos"
            description="Moneda base para precios, costos y reportes."
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold">Moneda</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FEATURED_CURRENCIES.map((code) => (
                <OptionCard
                  key={code}
                  name="currency"
                  value={code}
                  checked={currencyChoice === code}
                  onChange={() => setCurrencyChoice(code)}
                  title={code}
                  subtitle={currencyName(code)}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <OptionCard
                name="currency"
                value={OTHER_CURRENCY}
                checked={currencyChoice === OTHER_CURRENCY}
                onChange={() => setCurrencyChoice(OTHER_CURRENCY)}
                title="Otra"
                subtitle="De la lista"
                className="sm:w-32"
              />
              <select
                name="otherCurrency"
                aria-label="Otra moneda"
                value={otherCurrency}
                onChange={(event) => {
                  setOtherCurrency(event.target.value);
                  setCurrencyChoice(OTHER_CURRENCY);
                }}
                className={cn(fieldClass, "flex-1 border px-3 outline-none")}
              >
                <option value="">Elige otra moneda…</option>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} · {currencyName(code)}
                  </option>
                ))}
              </select>
            </div>
            <FieldError name="currency" error={fieldErrors.currency} />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold">
              Formato de fecha
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {DATE_FORMATS.map((format) => (
                <OptionCard
                  key={format}
                  name="dateFormat"
                  value={format}
                  checked={dateFormat === format}
                  onChange={() => setDateFormat(format)}
                  title={formatDate(SAMPLE_DATE, format)}
                  subtitle={format}
                />
              ))}
            </div>
            <FieldError name="dateFormat" error={fieldErrors.dateFormat} />
          </fieldset>

          <div className="rounded-xl border border-dashed border-input bg-muted/60 p-4">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Así se verá en tickets y reportes
            </p>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-link">
                {isCurrencyCode(previewCurrency)
                  ? formatMoney(SAMPLE_PRICE, previewCurrency)
                  : "—"}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                {isDateFormat(dateFormat)
                  ? formatDate(SAMPLE_DATE, dateFormat)
                  : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isCurrencyCode(previewCurrency)
                ? currencyName(previewCurrency)
                : "Elige una moneda"}
            </p>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-12 md:px-12">
        <span className="text-sm font-semibold text-muted-foreground">
          Paso 1 de 3 · Negocio
        </span>
        <Button type="submit" disabled={pending} className="h-11 gap-2 px-5">
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ArrowRight aria-hidden />
          )}
          Guardar y continuar
        </Button>
      </div>
    </form>
  );
}

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function TextField({
  name,
  label,
  icon,
  error,
  required,
  ...props
}: {
  name: CompanyProfileField;
  label: string;
  icon: ReactNode;
  error?: string;
} & Omit<ComponentProps<typeof Input>, "name" | "className">) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-[13px] font-semibold">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative flex items-center">
        {icon}
        <Input
          id={name}
          name={name}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(fieldClass, "pl-10")}
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

function OptionCard({
  name,
  value,
  checked,
  onChange,
  title,
  subtitle,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col rounded-lg border-2 px-3 py-2 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        checked
          ? "border-ring bg-accent/60"
          : "border-transparent bg-muted hover:border-input",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="text-sm font-bold">{title}</span>
      <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
    </label>
  );
}
